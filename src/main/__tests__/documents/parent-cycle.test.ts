import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/lychee-test') },
}));
vi.mock('../../db', async () => {
  const { getTestDb } = await import('../helpers');
  return { getDb: () => getTestDb() };
});

import {
  setupDb,
  getDb,
  insertDoc,
  getDocumentById,
  createDocument,
  updateDocument,
  trashDocument,
  moveDocument,
} from './setup';

describe('Document Repository — parent updates cannot form a cycle', () => {
  setupDb();

  it('rejects the IPC cycle of pointing A at its child B', () => {
    const a = createDocument({ title: 'Cycle A' });
    const b = createDocument({ title: 'Cycle B', parentId: a.id });

    expect(() => updateDocument(a.id, { parentId: b.id })).toThrow(
      'Cannot move document into its descendant',
    );
    expect(getDocumentById(a.id)!.parentId).toBeNull();
    expect(getDocumentById(b.id)!.parentId).toBe(a.id);
  });

  it('rejects a self parent from update and create-style assignment', () => {
    const a = createDocument({ title: 'A' });
    expect(() => updateDocument(a.id, { parentId: a.id })).toThrow(
      'Cannot move document into itself',
    );
    expect(getDocumentById(a.id)!.parentId).toBeNull();
  });

  it('rejects a mutual attach after the other side has committed', () => {
    const a = createDocument({ title: 'A' });
    const b = createDocument({ title: 'B' });
    updateDocument(a.id, { parentId: b.id });

    expect(() => updateDocument(b.id, { parentId: a.id })).toThrow(
      'Cannot move document into its descendant',
    );
    expect(getDocumentById(a.id)!.parentId).toBe(b.id);
    expect(getDocumentById(b.id)!.parentId).toBeNull();
  });

  it('rejects nesting under a missing parent without writing a row', () => {
    const a = createDocument({ title: 'A' });
    expect(() => updateDocument(a.id, { parentId: 'missing-parent' })).toThrow(
      'Target parent not found: missing-parent',
    );
    expect(getDocumentById(a.id)!.parentId).toBeNull();
  });

  it('rejects a deep descendant through updateDocument', () => {
    const a = createDocument({ title: 'A' });
    const b = createDocument({ title: 'B', parentId: a.id });
    const c = createDocument({ title: 'C', parentId: b.id });
    expect(() => moveDocument(a.id, c.id, 0)).toThrow(
      'Cannot move document into its descendant',
    );
    expect(() => updateDocument(a.id, { parentId: c.id })).toThrow(
      'Cannot move document into its descendant',
    );
    expect(getDocumentById(a.id)!.parentId).toBeNull();
    expect(getDocumentById(c.id)!.parentId).toBe(b.id);
  });

  it('stops on a stored cycle instead of following it forever', () => {
    const db = getDb();
    const a = insertDoc(db, { title: 'A' });
    const b = insertDoc(db, { title: 'B', parentId: a.id });
    db.prepare('UPDATE documents SET parentId = ? WHERE id = ?').run(b.id, a.id);

    expect(() => trashDocument(a.id)).toThrow(`Document tree contains a cycle at ${a.id}`);
    expect(getDocumentById(a.id)!.deletedAt).toBeNull();
    expect(getDocumentById(b.id)!.deletedAt).toBeNull();
    expect(getDocumentById(a.id)!.parentId).toBe(b.id);
    expect(getDocumentById(b.id)!.parentId).toBe(a.id);
  });
});
