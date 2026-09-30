type Flusher = () => Promise<void>;

export const saveSession = crypto.randomUUID();
const pendingSaves = new Set<Promise<unknown>>();
let editGeneration = 0;
const latestSaves = new Map<string, Promise<unknown>>();

export function trackSave(id: string, field: 'content' | 'title', pending: Promise<unknown>): void {
  pendingSaves.add(pending);
  latestSaves.set(`${field}:${id}`, pending);
  void pending.then(() => {
    if (latestSaves.get(`${field}:${id}`) === pending) latestSaves.delete(`${field}:${id}`);
  }).catch(() => {});
  void pending.finally(() => pendingSaves.delete(pending)).catch(() => {});
}

export function isCurrentSaveRevision(id: string, field: 'content' | 'title', revision: number): boolean {
  return revisions.get(`${field}:${id}`) === revision;
}

const flushers = new Set<Flusher>();

export function registerSaveFlusher(flusher: Flusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export function nextSaveRevision(id: string, field: 'content' | 'title'): number {
  editGeneration++;
  const key = `${field}:${id}`;
  const next = (revisions.get(key) ?? 0) + 1;
  revisions.set(key, next);
  return next;
}

const revisions = new Map<string, number>();

export async function flushAllSaves(): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (;;) {
    const generation = editGeneration;
    const pending = [...flushers].map(async (flusher) => flusher());
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(pending);
    // Unmounted tabs still own pending writes. New edits during an awaited save
    // need another flush before the application can close its database.
    while (pendingSaves.size) await Promise.allSettled([...pendingSaves]);
    if (generation !== editGeneration) continue;
    results.push(...await Promise.allSettled([...latestSaves.values()]));
    if (generation !== editGeneration) continue;
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected && rejected.status === 'rejected') {
      const reason = rejected.reason instanceof Error ? rejected.reason.message : String(rejected.reason);
      return { ok: false, reason };
    }
    return { ok: true };
  }
}

export function resetSaveFlushers(): void {
  flushers.clear();
  revisions.clear();
  editGeneration = 0;
  pendingSaves.clear();
  latestSaves.clear();
}

declare global {
  interface Window {
    __lycheeFlushSaves?: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  }
}
