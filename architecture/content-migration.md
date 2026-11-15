# Legacy editor content preservation

Legacy code nodes migrate recursively, including children nested inside flattened list items. Code text, whitespace, line endings, language and Unicode are preserved. Unknown legacy code payloads retain a textual JSON representation. Reapplying the migration is idempotent.

A pending URL remains serialized with its original source and request identity. Reload converts it to a normal link. Only the still-matching loading node may accept the associated response; cancellation, a replaced node or a changed URL cannot be overwritten by a late result. Failed resolution retains a link to the source.

Before a write replaces legacy code or loading-placeholder JSON, the document repository saves the exact original JSON in `document_content_backups` within the same transaction. A failed backup aborts the document update. Recovery: close the application, back up the SQLite file, inspect `document_content_backups` by `documentId`, and restore the chosen original `content` to that document in a SQLite transaction. Retain the backup table when rolling application code back; it is additive and older app versions ignore it.
