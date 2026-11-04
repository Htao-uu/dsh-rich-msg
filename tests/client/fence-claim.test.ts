// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { __test__ } from '../../src/client/dom-renderer';
import { DOM_MARKERS } from '../../src/shared/protocol';

const { claimFence, fenceLabel, labelToken, looksLikeDocument, isOurs } = __test__;

/** Build one host-shaped code surface: banner + editable pre body. */
function surface(label: string | null, raw: string): { source: HTMLElement; body: HTMLElement } {
  const source = document.createElement('div');
  source.className = 'md-code-block';
  if (label !== null) {
    const banner = document.createElement('div');
    banner.setAttribute('data-code-block-banner', '');
    const span = document.createElement('span');
    span.textContent = label;
    banner.append(span);
    source.append(banner);
  }
  const body = document.createElement('pre');
  body.setAttribute('data-code-block-content', '');
  body.textContent = raw;
  source.append(body);
  document.body.append(source);
  return { source, body };
}

const DOC = JSON.stringify({ version: 1, nodes: [{ type: 'text', content: 'hello' }] });
const REF = '{"version":1,"ref":"rm_0123456789abcdef0123"}';

describe('fence language gates', () => {
  it('reads the language from the host banner', () => {
    const { source, body } = surface('rich-msg', DOC);
    expect(fenceLabel(source, body)).toBe('rich-msg');
    expect(labelToken('rich-msg')).toBe('rich-msg');
    expect(labelToken('Code block')).toBe('');
    expect(labelToken('代码块')).toBe('');
    expect(isOurs('rich-msg')).toBe(true);
    expect(isOurs('rich-ui')).toBe(true);
    expect(isOurs('json')).toBe(false);
  });

  it('never claims an explicit foreign language even with a valid document', () => {
    const foreign = surface('json', DOC);
    expect(claimFence(foreign.source, foreign.body, DOC)).toBeNull();
    const python = surface('python', DOC);
    expect(claimFence(python.source, python.body, DOC)).toBeNull();
  });

  it('claims both fence languages with a valid document', () => {
    for (const label of ['rich-msg', 'rich-ui']) {
      const { source, body } = surface(label, DOC);
      const claim = claimFence(source, body, DOC);
      expect(claim?.kind).toBe('spec');
    }
  });

  it('claims the generic-label payload only when it really is a rich-msg document', () => {
    const generic = surface('Code block', DOC);
    expect(claimFence(generic.source, generic.body, DOC)?.kind).toBe('spec');
    const ordinary = surface('Code block', '{"hello":"world"}');
    expect(claimFence(ordinary.source, ordinary.body, '{"hello":"world"}')).toBeNull();
    const plain = surface('Code block', 'const x = 1;');
    expect(claimFence(plain.source, plain.body, 'const x = 1;')).toBeNull();
  });

  it('recognizes a reference document behind a generic label', () => {
    const generic = surface('代码块', REF);
    const claim = claimFence(generic.source, generic.body, REF);
    expect(claim).toEqual({ kind: 'ref', ref: 'rm_0123456789abcdef0123' });
    expect(looksLikeDocument(REF)).toBe(true);
    expect(looksLikeDocument('{"version":1}')).toBe(false);
  });

  it('reports an invalid payload under an explicit rich-msg label', () => {
    const broken = surface('rich-msg', '{"version":1,"nodes":[{"type":"nope"}]}');
    const raw = '{"version":1,"nodes":[{"type":"nope"}]}';
    const claim = claimFence(broken.source, broken.body, raw);
    expect(claim?.kind).toBe('invalid');
    if (claim?.kind === 'invalid') expect(claim.error.length).toBeGreaterThan(0);
  });

  it('leaves oversized documents as code when the label is foreign', () => {
    const huge = surface('json', 'x'.repeat(300_000));
    expect(claimFence(huge.source, huge.body, 'x'.repeat(300_000))).toBeNull();
  });
});
