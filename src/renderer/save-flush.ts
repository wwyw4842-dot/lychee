type Flusher = () => Promise<void>;
type SaveField = 'content' | 'title';
type SaveJob = { write: () => Promise<unknown>; failed: boolean; error?: unknown };

export const saveSession = crypto.randomUUID();
const pendingSaves = new Set<Promise<unknown>>();
const latestSaves = new Map<string, SaveJob>();
const flushers = new Set<Flusher>();
const discardedDocuments = new Set<string>();
const revisions = new Map<string, number>();
let editGeneration = 0;

function runSave(key: string, job: SaveJob): Promise<unknown> {
  job.failed = false;
  const pending = Promise.resolve().then(job.write);
  pendingSaves.add(pending);
  void pending.then(() => {
    if (latestSaves.get(key) === job) latestSaves.delete(key);
  }, error => {
    job.failed = true;
    job.error = error;
  }).finally(() => pendingSaves.delete(pending));
  return pending;
}

/** Retain the write closure (and its exact payload) until it commits. */
export function queueSave(id: string, field: SaveField, write: () => Promise<unknown>): Promise<unknown> {
  if (discardedDocuments.has(id)) return Promise.resolve();
  const key = `${field}:${id}`;
  const job: SaveJob = { write, failed: false };
  latestSaves.set(key, job);
  return runSave(key, job);
}

/** Only call after the user-requested permanent deletion has committed. */
export function discardDocumentSaves(ids: readonly string[]): void {
  for (const id of ids) {
    discardedDocuments.add(id);
    for (const field of ['content', 'title']) {
      latestSaves.delete(`${field}:${id}`);
      revisions.delete(`${field}:${id}`);
    }
  }
}

export function isCurrentSaveRevision(id: string, field: SaveField, revision: number): boolean {
  return revisions.get(`${field}:${id}`) === revision;
}

export function registerSaveFlusher(flusher: Flusher): () => void {
  flushers.add(flusher);
  return () => { flushers.delete(flusher); };
}

export function nextSaveRevision(id: string, field: SaveField): number {
  editGeneration++;
  const key = `${field}:${id}`;
  const next = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, next);
  return next;
}

export async function flushAllSaves(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const retried = new Set<SaveJob>();
  for (;;) {
    const generation = editGeneration;
    const pending = [...flushers].map(async (flusher) => flusher());
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(pending);
    while (pendingSaves.size) await Promise.allSettled([...pendingSaves]);
    if (generation !== editGeneration) continue;

    // Retry a failed write at most once per explicit flush. This also covers a
    // tab that unmounted: the closure still owns its original serialized data.
    for (const [key, job] of latestSaves) {
      if (job.failed && !retried.has(job)) {
        retried.add(job);
        void runSave(key, job).catch(() => {});
      }
    }
    while (pendingSaves.size) await Promise.allSettled([...pendingSaves]);
    if (generation !== editGeneration) continue;
    for (const job of latestSaves.values()) {
      if (job.failed) results.push({ status: 'rejected', reason: job.error });
    }
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected?.status === 'rejected') {
      return { ok: false, reason: rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason) };
    }
    return { ok: true };
  }
}

export function resetSaveFlushers(): void {
  flushers.clear();
  revisions.clear();
  discardedDocuments.clear();
  editGeneration = 0;
  pendingSaves.clear();
  latestSaves.clear();
}

declare global {
  interface Window {
    __lycheeFlushSaves?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  }
}
