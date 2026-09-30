import fs from 'fs';
import path from 'path';
import type { IpcMainInvokeEvent, WebContents } from 'electron';

export function isTrustedIpcSender(event: IpcMainInvokeEvent, expectedUrl: string, windows: readonly { webContents: WebContents }[]): boolean {
  if (!windows.some((window) => window.webContents === event.sender)) return false;
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
  try {
    const actual = new URL(event.senderFrame.url);
    const expected = new URL(expectedUrl);
    actual.hash = ''; expected.hash = '';
    return actual.href === expected.href;
  } catch { return false; }
}

export function resolveImageRequest(url: string, imagesDir: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'lychee-image:' || parsed.hostname !== 'image' || parsed.username || parsed.password || parsed.search) return null;
    const filename = decodeURIComponent(parsed.pathname.slice(1));
    if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp)$/i.test(filename)) return null;
    const root = fs.realpathSync(imagesDir);
    const resolved = fs.realpathSync(path.join(root, filename));
    if (path.dirname(resolved) !== root || !fs.statSync(resolved).isFile()) return null;
    return resolved;
  } catch { return null; }
}
