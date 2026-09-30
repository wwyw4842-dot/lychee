import { beforeEach, expect, test } from 'vitest';
import { flushAllSaves, registerSaveFlusher, resetSaveFlushers, trackSave, nextSaveRevision, isCurrentSaveRevision } from './save-flush';

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
  trackSave('closed-tab', 'content', pending);
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
  trackSave('doc', 'title', rejected);
  await expect(flushAllSaves()).resolves.toEqual({ ok: false, reason: 'disk full' });
  trackSave('doc', 'title', Promise.resolve());
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
