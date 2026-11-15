import { describe, expect, it } from 'vitest';
import { sanitizeSerializedState } from './migrate-state';

describe('persistent editor migrations', () => {
  it.each(['code-snippet', 'executable-code-block'])('preserves every code character from %s and is idempotent', (type) => {
    const code = '\tconst 中文 = "😀";\r\n\n  trailing  \n';
    const input: any = { root: { type: 'root', children: [{ type, code, language: 'ts' }] } };
    const original = JSON.stringify(input);
    const migrated: any = sanitizeSerializedState(input);
    expect(migrated.root.children).toEqual([{ type: 'code-block', version: 1, code, language: 'ts' }]);
    expect(sanitizeSerializedState(migrated)).toEqual(migrated);
    expect(JSON.stringify(input)).toBe(original);
  });

  it('migrates legacy code and interrupted links inside legacy flat lists', () => {
    const input: any = { root: { children: [{ type: 'list-item', indent: 0, children: [
      { type: 'code-snippet', code: 'keep\n  all', language: 'js' },
      { type: 'loading-placeholder', sourceUrl: 'https://example.com/keep' },
    ] }] } };
    const migrated: any = sanitizeSerializedState(input);
    const children = migrated.root.children[0].children[0].children;
    expect(children[0]).toMatchObject({ type: 'code-block', code: 'keep\n  all' });
    expect(children[1].children[0].url).toBe('https://example.com/keep');
    expect(sanitizeSerializedState(migrated)).toEqual(migrated);
  });

  it('preserves unknown legacy payload as text instead of silently discarding it', () => {
    const node = { type: 'code-snippet', value: 'valuable old source' };
    const migrated: any = sanitizeSerializedState({ root: { children: [node] } } as any);
    expect(migrated.root.children[0].code).toBe(JSON.stringify(node));
  });

  it('restores an interrupted URL inside nested content on reload', () => {
    const url = 'https://example.com/?q=%E4%B8%AD';
    const input: any = { root: { children: [{ type: 'list', children: [{ type: 'listitem', children: [
      { type: 'loading-placeholder', sourceUrl: url, requestId: 'old', label: 'Embedding…' },
    ] }] }] } };
    const migrated: any = sanitizeSerializedState(input);
    const paragraph = migrated.root.children[0].children[0].children[0];
    expect(paragraph.type).toBe('paragraph');
    expect(paragraph.children[0].url).toBe(url);
    expect(paragraph.children[0].children[0].text).toBe(url);
    expect(sanitizeSerializedState(migrated)).toEqual(migrated);
  });
});
