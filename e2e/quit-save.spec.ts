import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPackagedBinary, listDocumentsFromDb } from './electron-app';

test('immediate native quit flushes pending title and body before reopening', async () => {
  const executablePath = findPackagedBinary();
  expect(executablePath, 'packaged Electron build is required').toBeTruthy();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lychee-quit-regression-'));
  let app: ElectronApplication | undefined;
  const launch = () => _electron.launch({ executablePath: executablePath!, args: [`--user-data-dir=${userData}`, ...(process.env.CI ? ['--no-sandbox'] : [])], env: { ...process.env, NODE_ENV: 'test' } });
  try {
    app = await launch();
    let page = await app.firstWindow();
    await page.locator('[aria-label="New note"]').click();
    await page.locator('h1.editor-title:visible').click();
    await page.keyboard.type('Quit regression');
    await page.keyboard.press('Enter');
    await page.keyboard.type('unsaved body 雪');
    const closed = app.waitForEvent('close');
    await app.evaluate(({ app }) => app.quit());
    await closed;
    app = await launch();
    page = await app.firstWindow();
    await page.waitForSelector('aside[data-state]');
    const documents = await listDocumentsFromDb(page);
    expect(documents).toHaveLength(1);
    expect(documents[0].title).toBe('Quit regression');
    expect(documents[0].content).toContain('unsaved body 雪');
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

async function withIsolatedApp(run: (app: ElectronApplication) => Promise<void>) {
  const executablePath = findPackagedBinary();
  expect(executablePath, 'packaged Electron build is required').toBeTruthy();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'lychee-quit-boundary-'));
  const app = await _electron.launch({ executablePath: executablePath!, args: [`--user-data-dir=${userData}`, ...(process.env.CI ? ['--no-sandbox'] : [])], env: { ...process.env, NODE_ENV: 'test' } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('aside[data-state]');
    await run(app);
  } finally {
    // Failed-flush cases intentionally refuse app.quit; this isolated test app
    // has no user data and is terminated explicitly after checking that refusal.
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

test('native quit waits for a slow renderer flush', async () => {
  await withIsolatedApp(async app => {
    const page = await app.firstWindow();
    await page.evaluate(() => {
      const original = (window as any).__lycheeFlushSaves;
      (window as any).__lycheeFlushSaves = async () => {
        await new Promise(resolve => { (window as any).releaseQuit = resolve; });
        return original();
      };
    });
    await app.evaluate(({ app }) => app.quit());
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseQuit)).toBe('function');
    expect(app.windows()).toHaveLength(1);
    const closed = app.waitForEvent('close');
    await page.evaluate(() => (window as any).releaseQuit());
    await closed;
  });
});

test('native quit keeps the database open when a save fails', async () => {
  await withIsolatedApp(async app => {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }) => { dialog.showErrorBox = (_title, reason) => { (globalThis as any).quitFailure = reason; }; });
    await page.evaluate(() => { (window as any).__lycheeFlushSaves = async () => ({ ok: false, reason: 'write failed' }); });
    await app.evaluate(({ app }) => app.quit());
    await expect.poll(() => app.evaluate(() => (globalThis as any).quitFailure)).toBe('write failed');
    expect(app.windows()).toHaveLength(1);
    expect(await listDocumentsFromDb(page)).toEqual([]);
  });
});

test('native quit reports a timeout without closing the database', async () => {
  await withIsolatedApp(async app => {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }) => { dialog.showErrorBox = (_title, reason) => { (globalThis as any).quitFailure = reason; }; });
    await page.evaluate(() => { (window as any).__lycheeFlushSaves = () => new Promise(() => {}); });
    await app.evaluate(({ app }) => app.quit());
    await expect.poll(() => app.evaluate(() => (globalThis as any).quitFailure), { timeout: 15_000 }).toBe('Saving timed out');
    expect(app.windows()).toHaveLength(1);
    expect(await listDocumentsFromDb(page)).toEqual([]);
  });
});

test('renderer reload starts a fresh save session and persists its first edit', async () => {
  await withIsolatedApp(async app => {
    const page = await app.firstWindow();
    await page.locator('[aria-label="New note"]').click();
    const title = page.locator('h1.editor-title:visible');
    await title.fill('Before reload');
    await page.evaluate(() => (window as any).__lycheeFlushSaves());
    expect((await listDocumentsFromDb(page))[0].title).toBe('Before reload');
    await page.reload();
    await page.waitForSelector('aside[data-state]');
    await page.locator('aside[data-state]').getByText('Before reload', { exact: true }).click();
    await title.fill('After reload');
    await page.evaluate(() => (window as any).__lycheeFlushSaves());
    expect((await listDocumentsFromDb(page))[0].title).toBe('After reload');
  });
});
