import { expect, test } from 'vitest';
import { coordinateQuit } from './quit-save';

test('quit waits until every window flush finishes', async () => {
  const order: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const result = coordinateQuit({
    flushWindows: async () => {
      order.push('flush-start');
      await gate;
      order.push('flush-end');
      return [{ ok: true }];
    },
    closeDatabase: () => order.push('close'),
    quit: () => order.push('quit'),
    onFailure: () => order.push('fail'),
  });
  await Promise.resolve();
  expect(order).toEqual(['flush-start']);
  release();
  await expect(result).resolves.toBe('quit');
  expect(order).toEqual(['flush-start', 'flush-end', 'close', 'quit']);
});

test('a failed flush keeps the database open and does not quit', async () => {
  const order: string[] = [];
  const result = await coordinateQuit({
    flushWindows: async () => [{ ok: false, reason: 'disk full' }],
    closeDatabase: () => order.push('close'),
    quit: () => order.push('quit'),
    onFailure: (reason) => order.push(reason),
  });
  expect(result).toBe('stayed');
  expect(order).toEqual(['disk full']);
});
