import { describe, expect, it } from 'vitest';
import {
  ACTION_PREFIX,
  ARTIFACT_ID_PATTERN,
  MAX_SOURCE_LENGTH,
  artifactUrl,
  formatActionText,
  parseReference
} from '../../src/shared/protocol';

describe('reference contract', () => {
  it('accepts exactly one version/ref object', () => {
    expect(parseReference('{"version":1,"ref":"rm_0123456789abcdef0123"}')).toEqual({
      version: 1,
      ref: 'rm_0123456789abcdef0123'
    });
    expect(parseReference('  {"ref":"rm_0123456789abcdef0123","version":1}  ')).toEqual({
      version: 1,
      ref: 'rm_0123456789abcdef0123'
    });
  });

  it('rejects wrong versions, extra members and malformed ids', () => {
    expect(parseReference('{"version":2,"ref":"rm_0123456789abcdef0123"}')).toBeNull();
    expect(parseReference('{"version":1,"ref":"rm_0123456789abcdef0123","extra":true}')).toBeNull();
    expect(parseReference('{"version":1,"ref":"nope"}')).toBeNull();
    expect(parseReference('{"version":1}')).toBeNull();
    expect(parseReference('not json')).toBeNull();
    expect(parseReference('')).toBeNull();
    expect(parseReference('null')).toBeNull();
    expect(parseReference('[]')).toBeNull();
    expect(parseReference('{"__proto__":{"version":1,"ref":"rm_0123456789abcdef0123"}}')).toBeNull();
  });

  it('keeps the documented id grammar and size cap', () => {
    expect(ARTIFACT_ID_PATTERN.test('rm_0123456789abcdef0123')).toBe(true);
    expect(ARTIFACT_ID_PATTERN.test('rm_0123456789ABCDEF0123')).toBe(false);
    expect(ARTIFACT_ID_PATTERN.test('rm_short')).toBe(false);
    expect(MAX_SOURCE_LENGTH).toBe(256_000);
  });
});

describe('action envelope', () => {
  it('formats the documented user message', () => {
    const text = formatActionText('set', { key: 'x', value: 2 });
    expect(text).not.toBeNull();
    expect(text!.startsWith(ACTION_PREFIX + ' ')).toBe(true);
    expect(JSON.parse(text!.slice(ACTION_PREFIX.length + 1))).toEqual({
      action: 'set',
      payload: { key: 'x', value: 2 }
    });
  });

  it('rejects empty, oversized and unserializable actions', () => {
    expect(formatActionText('', {})).toBeNull();
    expect(formatActionText('x'.repeat(300), {})).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(formatActionText('set', cyclic)).toBeNull();
    expect(formatActionText('set', { big: 'x'.repeat(40_000) })).toBeNull();
  });
});

describe('artifact route helper', () => {
  it('joins origin, path, id and session without double slashes', () => {
    expect(artifactUrl('http://127.0.0.1:1/', 'rm_0123456789abcdef0123', 's-1')).toBe(
      'http://127.0.0.1:1/rich-msg/artifact/rm_0123456789abcdef0123?session=s-1'
    );
    expect(artifactUrl('http://x', 'rm_0123456789abcdef0123', 'a:b')).toContain('session=a%3Ab');
  });
});
