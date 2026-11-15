export type SaveField = 'content' | 'title';

const sessions = new Map<number, string>();

export function startSaveSession(senderId: number, session: string): void {
  if (typeof session !== "string" || !/^[a-z0-9-]{36}$/i.test(session)) throw new Error("Invalid save session");
  const previous = sessions.get(senderId);
  if (previous) for (const key of latest.keys()) if (key.startsWith(`${previous}:`)) latest.delete(key);
  sessions.set(senderId, session);
}

export function endSaveSession(senderId: number): void {
  const previous = sessions.get(senderId);
  if (previous) for (const key of latest.keys()) if (key.startsWith(`${previous}:`)) latest.delete(key);
  sessions.delete(senderId);
}

export function isSaveSessionCurrent(senderId: number, session: string): boolean {
  return sessions.get(senderId) === session;
}

const latest = new Map<string, { content: number; title: number }>();

export function acceptSaveRevision(id: string, field: SaveField, revision: number, session = ""): boolean {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid save revision");
  const key = `${session}:${id}`;
  const row = latest.get(key) ?? { content: 0, title: 0 };
  if (revision < row[field]) return false;
  row[field] = revision;
  latest.set(key, row);
  return true;
}

export function resetSaveRevisions(): void {
  latest.clear();
  sessions.clear();
}
