import { beforeEach, expect, test } from 'vitest';
import { acceptSaveRevision, resetSaveRevisions, startSaveSession, isSaveSessionCurrent } from './save-revision';

beforeEach(() => resetSaveRevisions());

test('an older content revision does not overwrite a newer one', () => {
  expect(acceptSaveRevision('doc', 'content', 2)).toBe(true);
  expect(acceptSaveRevision('doc', 'content', 1)).toBe(false);
  expect(acceptSaveRevision('doc', 'content', 2)).toBe(true);
});

test('title and content revisions are independent', () => {
  expect(acceptSaveRevision('doc', 'title', 1)).toBe(true);
  expect(acceptSaveRevision('doc', 'content', 1)).toBe(true);
  expect(acceptSaveRevision('doc', 'title', 2)).toBe(true);
});


test('a new renderer session can restart revisions and retires the prior session', () => {
  const old = crypto.randomUUID(), fresh = crypto.randomUUID();
  startSaveSession(1, old);
  expect(acceptSaveRevision('doc', 'content', 9, old)).toBe(true);
  startSaveSession(1, fresh);
  expect(isSaveSessionCurrent(1, old)).toBe(false);
  expect(isSaveSessionCurrent(1, fresh)).toBe(true);
  expect(acceptSaveRevision('doc', 'content', 1, fresh)).toBe(true);
});
