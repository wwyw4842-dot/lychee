import { randomUUID } from 'crypto';
import type { DocumentRow, NoteMetadata } from '../../shared/documents';
import { getDb } from '../db';

function nowIso() {
  return new Date().toISOString();
}

/** Raw row from SQLite where metadata is a JSON string. */
type RawDocumentRow = Omit<DocumentRow, 'metadata'> & { metadata: string };

/** Parse the metadata JSON string into an object. */
function hydrateRow(raw: RawDocumentRow): DocumentRow {
  let metadata: NoteMetadata = {};
  try { metadata = JSON.parse(raw.metadata) ?? {}; } catch { /* default to empty */ }
  return { ...raw, metadata };
}

function hydrateRows(rows: RawDocumentRow[]): DocumentRow[] {
  return rows.map(hydrateRow);
}

const maxTreeDepth = 1000;

type TreeNode = { parentId: string | null; deletedAt: string | null };

function readTreeNode(db: ReturnType<typeof getDb>, id: string): TreeNode | undefined {
  return db
    .prepare(`SELECT parentId, deletedAt FROM documents WHERE id = ?`)
    .get(id) as TreeNode | undefined;
}

/** Reject a parent assignment that would cycle, dangle, or hang off the trash. */
function assertValidParent(
  db: ReturnType<typeof getDb>,
  documentId: string | null,
  newParentId: string | null,
): void {
  if (newParentId == null) return;
  if (documentId != null && newParentId === documentId) {
    throw new Error('Cannot move document into itself');
  }

  const seen = new Set<string>();
  let current: string | null = newParentId;
  for (let depth = 0; current != null; depth += 1) {
    if (documentId != null && current === documentId) {
      throw new Error('Cannot move document into its descendant');
    }
    if (seen.has(current)) {
      throw new Error(`Document tree contains a cycle at ${current}`);
    }
    if (depth >= maxTreeDepth) {
      throw new Error('Document tree is too deep');
    }
    seen.add(current);
    const node = readTreeNode(db, current);
    if (!node) {
      if (current === newParentId) {
        throw new Error(`Target parent not found: ${newParentId}`);
      }
      throw new Error(`Document tree is missing ancestor ${current}`);
    }
    if (node.deletedAt) {
      throw new Error('Cannot move document under a trashed parent');
    }
    current = node.parentId;
  }
}

/** Walk parentId links. A repeated id is a stored cycle and stops the walk. */
function collectRelatedIds(
  db: ReturnType<typeof getDb>,
  rootId: string,
  mode: 'all' | 'trashed',
): string[] {
  const ids = [rootId];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let depth = 0; frontier.length > 0; depth += 1) {
    if (depth >= maxTreeDepth) throw new Error('Document tree is too deep');
    const next: string[] = [];
    for (const id of frontier) {
      const children = db
        .prepare(`SELECT id, deletedAt FROM documents WHERE parentId = ?`)
        .all(id) as { id: string; deletedAt: string | null }[];
      for (const child of children) {
        if (seen.has(child.id)) {
          throw new Error(`Document tree contains a cycle at ${child.id}`);
        }
        if (mode === 'trashed' && !child.deletedAt) continue;
        seen.add(child.id);
        ids.push(child.id);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return ids;
}

export function listDocuments(params: {
  limit?: number;
  offset?: number;
}): DocumentRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);

  return hydrateRows(
    db
      .prepare(
        `SELECT id, title, content, createdAt, updatedAt, parentId, emoji, deletedAt, sortOrder, metadata
         FROM documents
         WHERE deletedAt IS NULL
         ORDER BY sortOrder ASC, updatedAt DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as RawDocumentRow[],
  );
}

export function listTrashedDocuments(params: {
  limit?: number;
  offset?: number;
}): DocumentRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);

  return hydrateRows(
    db
      .prepare(
        `SELECT id, title, content, createdAt, updatedAt, parentId, emoji, deletedAt, sortOrder, metadata
         FROM documents
         WHERE deletedAt IS NOT NULL
         ORDER BY deletedAt DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as RawDocumentRow[],
  );
}

export function getDocumentById(id: string): DocumentRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, title, content, createdAt, updatedAt, parentId, emoji, deletedAt, sortOrder, metadata
       FROM documents
       WHERE id = ?`,
    )
    .get(id) as RawDocumentRow | undefined;
  return row ? hydrateRow(row) : null;
}

export function createDocument(input: {
  title?: string;
  content?: string;
  parentId?: string | null;
  emoji?: string | null;
}): DocumentRow {
  const db = getDb();

  const createdAt = nowIso();
  const parentId = input.parentId ?? null;
  const doc: DocumentRow = {
    id: randomUUID(),
    title: (() => {
      const t = (input.title?.trim() ?? '') || ''
      return t === 'Untitled' ? '' : t
    })(),
    content: input.content ?? '',
    createdAt,
    updatedAt: createdAt,
    parentId,
    emoji: input.emoji ?? null,
    deletedAt: null,
    sortOrder: 0,
    metadata: {},
  };

  const insert = db.transaction(() => {
    assertValidParent(db, null, parentId);
    // New docs go to the top, so sortOrder = 0, and shift others down.
    db.prepare(
      `UPDATE documents SET sortOrder = sortOrder + 1
       WHERE parentId IS ? AND deletedAt IS NULL`,
    ).run(parentId);
    db.prepare(
      `INSERT INTO documents (id, title, content, createdAt, updatedAt, parentId, emoji, deletedAt, sortOrder, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      doc.id,
      doc.title,
      doc.content,
      doc.createdAt,
      doc.updatedAt,
      doc.parentId,
      doc.emoji,
      doc.deletedAt,
      doc.sortOrder,
      JSON.stringify(doc.metadata),
    );
    return doc;
  });

  return insert.immediate();
}

export function updateDocument(
  id: string,
  patch: {
    title?: string;
    content?: string;
    parentId?: string | null;
    emoji?: string | null;
    metadata?: Partial<NoteMetadata>;
  },
): DocumentRow {
  const db = getDb();
  const apply = db.transaction(() => {
    const existing = getDocumentById(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    const next: DocumentRow = {
      ...existing,
      title:
        patch.title === undefined ? existing.title : patch.title.trim(),
      content: patch.content === undefined ? existing.content : patch.content,
      parentId:
        patch.parentId === undefined ? existing.parentId : patch.parentId ?? null,
      emoji: patch.emoji === undefined ? existing.emoji : patch.emoji ?? null,
      metadata: patch.metadata ? { ...existing.metadata, ...patch.metadata } : existing.metadata,
      deletedAt: existing.deletedAt,
      updatedAt: nowIso(),
    };

    if (next.parentId !== existing.parentId) {
      if (existing.deletedAt) throw new Error('Cannot move a trashed document');
      assertValidParent(db, id, next.parentId);
    }

    db.prepare(
      `UPDATE documents
       SET title = ?, content = ?, updatedAt = ?, parentId = ?, emoji = ?, metadata = ?
       WHERE id = ?`,
    ).run(
      next.title,
      next.content,
      next.updatedAt,
      next.parentId,
      next.emoji,
      JSON.stringify(next.metadata),
      id,
    );

    return next;
  });

  return apply.immediate();
}

export function deleteDocument(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
}

/** Trash a document and all its nested descendants (cascade to trash). Returns doc + list of all trashed ids for UI. */
export function trashDocument(id: string): { document: DocumentRow; trashedIds: string[] } {
  const db = getDb();
  const existing = getDocumentById(id);
  if (!existing) {
    throw new Error(`Document not found: ${id}`);
  }
  const deletedAt = nowIso();

  const tx = db.transaction(() => {
    const trashedIds = collectRelatedIds(db, id, 'all');
    const placeholders = trashedIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE documents SET deletedAt = ?, updatedAt = ? WHERE id IN (${placeholders})`,
    ).run(deletedAt, deletedAt, ...trashedIds);

    // Close the gap in siblings' sortOrder (only for the top-level trashed doc, not descendants)
    db.prepare(
      `UPDATE documents SET sortOrder = sortOrder - 1
       WHERE parentId IS ? AND sortOrder > ? AND deletedAt IS NULL`,
    ).run(existing.parentId, existing.sortOrder);
    return trashedIds;
  });
  const trashedIds = tx.immediate();

  return {
    document: { ...existing, deletedAt, updatedAt: deletedAt },
    trashedIds,
  };
}

/** Restore a document and all its trashed descendants. Returns the restored document and all restored ids. */
export function restoreDocument(id: string): { document: DocumentRow; restoredIds: string[] } {
  const db = getDb();
  const existing = getDocumentById(id);
  if (!existing) {
    throw new Error(`Document not found: ${id}`);
  }
  if (!existing.deletedAt) {
    return { document: existing, restoredIds: [id] };
  }
  const updatedAt = nowIso();

  const restoredIds = collectRelatedIds(db, id, 'trashed');

  if (restoredIds.length > 0) {
    const tx = db.transaction(() => {
      // Clamp restore position to current sibling count
      const siblingCount = (db.prepare(
        `SELECT COUNT(*) as c FROM documents WHERE parentId IS ? AND deletedAt IS NULL`,
      ).get(existing.parentId) as { c: number }).c;
      const restorePosition = Math.min(existing.sortOrder, siblingCount);

      // Make room at the restore position by shifting siblings
      db.prepare(
        `UPDATE documents SET sortOrder = sortOrder + 1
         WHERE parentId IS ? AND sortOrder >= ? AND deletedAt IS NULL`,
      ).run(existing.parentId, restorePosition);

      // Update the document's sortOrder to the clamped position
      db.prepare(
        `UPDATE documents SET sortOrder = ? WHERE id = ?`,
      ).run(restorePosition, id);

      // Restore all documents
      const placeholders = restoredIds.map(() => '?').join(',');
      db.prepare(
        `UPDATE documents SET deletedAt = NULL, updatedAt = ? WHERE id IN (${placeholders})`,
      ).run(updatedAt, ...restoredIds);
    });
    tx();
  }

  const restored = getDocumentById(id)!;
  return { document: restored, restoredIds };
}

/** Permanently delete a document and all its descendants from the database. */
export function permanentDeleteDocument(id: string): { deletedIds: string[] } {
  const db = getDb();
  const existing = getDocumentById(id);
  if (!existing) {
    throw new Error(`Document not found: ${id}`);
  }
  const deletedIds = collectRelatedIds(db, id, 'all');
  const placeholders = deletedIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM documents WHERE id IN (${placeholders})`).run(...deletedIds);
  return { deletedIds };
}

/**
 * Move a document to a new position in the tree.
 * @param id - Document to move
 * @param newParentId - New parent (null for root level)
 * @param newSortOrder - Target sort order among new siblings
 */
export function moveDocument(
  id: string,
  newParentId: string | null,
  newSortOrder: number,
): DocumentRow {
  const db = getDb();
  const existing = getDocumentById(id);
  if (!existing) {
    throw new Error(`Document not found: ${id}`);
  }

  if (existing.deletedAt) {
    throw new Error('Cannot move a trashed document');
  }

  // Clamp sortOrder to valid range
  newSortOrder = Math.max(0, Math.floor(newSortOrder));
  const siblingCount = (db.prepare(
    `SELECT COUNT(*) as c FROM documents WHERE parentId IS ? AND deletedAt IS NULL AND id != ?`,
  ).get(newParentId, id) as { c: number }).c;
  newSortOrder = Math.min(newSortOrder, siblingCount);

  const oldParentId = existing.parentId;
  const oldSortOrder = existing.sortOrder;
  const changingParent = oldParentId !== newParentId;

  const tx = db.transaction(() => {
    assertValidParent(db, id, newParentId);
    if (changingParent) {
      // Moving to different parent
      // 1. Close gap in old parent's children
      db.prepare(
        `UPDATE documents SET sortOrder = sortOrder - 1
         WHERE parentId IS ? AND sortOrder > ? AND deletedAt IS NULL`,
      ).run(oldParentId, oldSortOrder);

      // 2. Make room in new parent's children
      db.prepare(
        `UPDATE documents SET sortOrder = sortOrder + 1
         WHERE parentId IS ? AND sortOrder >= ? AND deletedAt IS NULL`,
      ).run(newParentId, newSortOrder);

      // 3. Update the document
      db.prepare(
        `UPDATE documents SET parentId = ?, sortOrder = ?, updatedAt = ?
         WHERE id = ?`,
      ).run(newParentId, newSortOrder, nowIso(), id);
    } else {
      // Same parent, just reordering
      if (newSortOrder === oldSortOrder) {
        // No change needed
        return;
      }

      if (newSortOrder < oldSortOrder) {
        // Moving up: shift items between [newSortOrder, oldSortOrder) down by 1
        db.prepare(
          `UPDATE documents SET sortOrder = sortOrder + 1
           WHERE parentId IS ? AND sortOrder >= ? AND sortOrder < ? AND id != ? AND deletedAt IS NULL`,
        ).run(oldParentId, newSortOrder, oldSortOrder, id);
      } else {
        // Moving down: shift items between (oldSortOrder, newSortOrder] up by 1
        db.prepare(
          `UPDATE documents SET sortOrder = sortOrder - 1
           WHERE parentId IS ? AND sortOrder > ? AND sortOrder <= ? AND id != ? AND deletedAt IS NULL`,
        ).run(oldParentId, oldSortOrder, newSortOrder, id);
      }

      // Update the document's sortOrder
      db.prepare(
        `UPDATE documents SET sortOrder = ?, updatedAt = ?
         WHERE id = ?`,
      ).run(newSortOrder, nowIso(), id);
    }
  });

  tx.immediate();

  return getDocumentById(id)!;
}