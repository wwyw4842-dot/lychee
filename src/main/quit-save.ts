export type FlushResult = { ok: true } | { ok: false; reason: string };

export async function coordinateQuit(input: {
  flushWindows: () => Promise<FlushResult[]>;
  closeDatabase: () => void;
  quit: () => void;
  onFailure: (reason: string) => void;
}): Promise<'quit' | 'stayed'> {
  const results = await input.flushWindows();
  const failed = results.find((result) => !result.ok);
  if (failed && failed.ok === false) {
    input.onFailure(failed.reason);
    return 'stayed';
  }
  input.closeDatabase();
  input.quit();
  return 'quit';
}
