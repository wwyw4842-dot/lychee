import { beforeEach, expect, test } from 'vitest';
import { flushAllSaves, registerSaveFlusher, resetSaveFlushers, queueSave, nextSaveRevision, isCurrentSaveRevision, discardDocumentSaves } from './save-flush';

beforeEach(() => resetSaveFlushers());

test('flush waits for a slow save before reporting success', async () => {
  let finished = false;
  registerSaveFlusher(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    finished = true;
  });
  const result = await flushAllSaves();
  expect(finished).toBe(true);
  expect(result).toEqual({ ok: true });
});

test('one tab failing keeps the flush unsuccessful', async () => {
  registerSaveFlusher(async () => undefined);
  registerSaveFlusher(async () => {
    throw new Error('write failed');
  });
  const result = await flushAllSaves();
  expect(result).toEqual({ ok: false, reason: 'write failed' });
});


test('unmounted tabs keep their pending saves in the quit barrier', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  void queueSave('closed-tab', 'content', () => pending);
  const unregister = registerSaveFlusher(async () => {});
  unregister();
  let finished = false;
  const flushed = flushAllSaves().then(result => { finished = true; return result; });
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  await expect(flushed).resolves.toEqual({ ok: true });
});

test('failed unmounted save blocks quit until a later save for that field succeeds', async () => {
  const rejected = Promise.reject(new Error('disk full'));
  void queueSave('doc', 'title', () => rejected);
  await expect(flushAllSaves()).resolves.toEqual({ ok: false, reason: 'disk full' });
  void queueSave('doc', 'title', async () => {});
  await expect(flushAllSaves()).resolves.toEqual({ ok: true });
});

test('a new edit invalidates an earlier response before the new debounce runs', () => {
  const revision = nextSaveRevision('doc', 'title');
  expect(isCurrentSaveRevision('doc', 'title', revision)).toBe(true);
  nextSaveRevision('doc', 'title');
  expect(isCurrentSaveRevision('doc', 'title', revision)).toBe(false);
});


test('edits arriving during a slow save trigger another flush', async () => {
  let release!: () => void;
  let calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  registerSaveFlusher(async () => {
    if (++calls === 1) await gate;
  });
  const result = flushAllSaves();
  nextSaveRevision('doc', 'content');
  release();
  await expect(result).resolves.toEqual({ ok: true });
  expect(calls).toBe(2);
});


test('closed-tab failed payload is retried unchanged after storage recovers', async () => {
  const payload = { id: 'closed', content: 'exact unsaved 雪\r\n\t' };
  const writes: typeof payload[] = [];
  let available = false;
  void queueSave(payload.id, 'content', async () => {
    if (!available) throw new Error('disk full');
    writes.push({ ...payload });
  });
  await expect(flushAllSaves()).resolves.toEqual({ ok: false, reason: 'disk full' });
  available = true;
  await expect(flushAllSaves()).resolves.toEqual({ ok: true });
  expect(writes).toEqual([payload]);
});


test('only confirmed permanent deletion discards retries and late unmount saves', async () => {
  let attempts = 0;
  const write = async () => { attempts++; throw new Error('unavailable'); };
  void queueSave('deleted', 'content', write);
  await expect(flushAllSaves()).resolves.toMatchObject({ ok: false });
  const before = attempts;
  discardDocumentSaves(['deleted']);
  await queueSave('deleted', 'content', write);
  await expect(flushAllSaves()).resolves.toEqual({ ok: true });
  expect(attempts).toBe(before);
});
