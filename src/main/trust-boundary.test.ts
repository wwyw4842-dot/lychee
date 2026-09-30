import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isTrustedIpcSender, resolveImageRequest } from './trust-boundary';

describe('image protocol boundary', () => {
  it('accepts a stored image and denies encoded paths, text and symlinks outside the image root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lychee-boundary-'));
    const dir = path.join(root, 'images'); fs.mkdirSync(dir);
    const name = '12345678-1234-1234-1234-123456789abc.png';
    fs.writeFileSync(path.join(dir, name), 'png');
    try {
      expect(resolveImageRequest(`lychee-image://image/${name}`, dir)).toBe(fs.realpathSync(path.join(dir, name)));
      for (const tail of ['%2e%2e%2foutside.png', '..%5coutside.png', '%ZZ', 'outside.txt']) {
        expect(resolveImageRequest(`lychee-image://image/${tail}`, dir)).toBeNull();
      }
      fs.writeFileSync(path.join(root, 'outside.png'), 'private');
      fs.unlinkSync(path.join(dir, name)); fs.symlinkSync(path.join(root, 'outside.png'), path.join(dir, name));
      expect(resolveImageRequest(`lychee-image://image/${name}`, dir)).toBeNull();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});

describe('privileged IPC sender', () => {
  it('accepts only the registered main frame at the bundled renderer URL', () => {
    const expected = 'file:///app/index.html';
    const frame = { url: expected };
    const sender = { mainFrame: frame };
    const windows: any = [{ webContents: sender }];
    expect(isTrustedIpcSender({ sender, senderFrame: frame } as any, expected, windows)).toBe(true);
    expect(isTrustedIpcSender({ sender, senderFrame: { url: expected } } as any, expected, windows)).toBe(false);
    expect(isTrustedIpcSender({ sender: {}, senderFrame: frame } as any, expected, windows)).toBe(false);
    frame.url = 'https://example.com';
    expect(isTrustedIpcSender({ sender, senderFrame: frame } as any, expected, windows)).toBe(false);
  });
});
