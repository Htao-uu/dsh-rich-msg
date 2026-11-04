// @vitest-environment jsdom
import React, { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFenceRenderer } from '../../src/client/dom-renderer';
import type { RowFacts } from '../../src/client/chat-view';

const DOC = JSON.stringify({ version: 1, nodes: [{ type: 'text', content: 'rendered-hello' }] });
const REF = '{"version":1,"ref":"rm_0123456789abcdef0123"}';

/** Build the host DOM shape this adapter consumes. */
function hostDom(kind: string, label: string, raw: string, key = 'k1'): { row: HTMLElement; source: HTMLElement } {
  const scope = document.createElement('div');
  scope.id = 'scope';
  const row = document.createElement('div');
  row.setAttribute('data-chat-flow-kind', kind);
  row.setAttribute('data-chat-node-key', key);
  const source = document.createElement('div');
  source.className = 'md-code-block';
  const banner = document.createElement('div');
  banner.setAttribute('data-code-block-banner', '');
  const span = document.createElement('span');
  span.textContent = label;
  banner.append(span);
  const body = document.createElement('pre');
  body.setAttribute('data-code-block-content', '');
  body.textContent = raw;
  source.append(banner, body);
  row.append(source);
  scope.append(row);
  document.body.append(scope);
  return { row, source };
}

/** Fake chat snapshot adapter; facts are supplied per test. */
function fakeChat(facts: RowFacts | undefined) {
  const listeners = new Set<() => void>();
  return {
    sessionId: () => 'session-1',
    factsForRow: () => facts,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      for (const listener of [...listeners]) listener();
    },
    snapshot: () => undefined,
    artifactsOf: () => new Map(),
    dispose() {}
  };
}

function facts(patch: Partial<RowFacts> = {}): RowFacts {
  return {
    key: 'k1',
    kind: 'assistant-step',
    turn: 1,
    finality: 'final',
    fenceLocation: 'text',
    artifacts: new Map(),
    ...patch
  };
}

function fakeArtifacts(resolved: { status: 'resolved' | 'missing'; id: string; spec?: unknown }) {
  return {
    sync: () => undefined,
    resolve: async () => resolved,
    dispose() {}
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('DOM fence renderer', () => {
  it('mounts a rich surface for a final answer fence and hides the source', async () => {
    const { source } = hostDom('assistant-step', 'rich-msg', DOC);
    const chat = fakeChat(facts());
    let dispose: () => void = () => {};
    await act(async () => {
      dispose = installFenceRenderer({
        chat: chat as never,
        artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never,
        sendAction: () => {}
      });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(1);
    expect(source.hidden).toBe(true);
    expect(document.body.textContent).toContain('rendered-hello');
    await act(async () => {
      dispose();
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    expect(source.hidden).toBe(false);
  });

  it('leaves an intermediate-step fence as code', async () => {
    const { source } = hostDom('assistant-step', 'rich-msg', DOC);
    await act(async () => {
      installFenceRenderer({
        chat: fakeChat(facts({ finality: 'not-final' })) as never,
        artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never,
        sendAction: () => {}
      });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    expect(source.hidden).toBe(false);
  });

  it('leaves a reasoning fence as code', async () => {
    const { source } = hostDom('assistant-step', 'rich-msg', DOC);
    await act(async () => {
      installFenceRenderer({
        chat: fakeChat(facts({ fenceLocation: 'reasoning' })) as never,
        artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never,
        sendAction: () => {}
      });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    expect(source.hidden).toBe(false);
  });

  it('never claims fences outside an assistant row', async () => {
    const { source } = hostDom('tool-call', 'rich-msg', DOC);
    await act(async () => {
      installFenceRenderer({
        chat: fakeChat(undefined) as never,
        artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never,
        sendAction: () => {}
      });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    expect(source.hidden).toBe(false);
  });

  it('renders a diagnostic for an invalid settled document and restores it on dispose', async () => {
    const broken = '{"version":1,"nodes":[{"type":"nope"}]}';
    const { source } = hostDom('assistant-step', 'rich-msg', broken);
    let dispose: () => void = () => {};
    await act(async () => {
      dispose = installFenceRenderer({
        chat: fakeChat(facts()) as never,
        artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never,
        sendAction: () => {}
      });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]').length).toBe(1);
    expect(source.hidden).toBe(true);
    await act(async () => {
      dispose();
      await tick();
    });
    expect(source.hidden).toBe(false);
  });

  it('resolves a reference fence and reports an unresolved one', async () => {
    hostDom('assistant-step', 'rich-msg', REF);
    const resolvedSpec = JSON.parse(DOC);
    const chat = fakeChat(facts());
    const artifacts = {
      sync: () => ({
        status: 'resolved' as const,
        id: 'rm_0123456789abcdef0123',
        spec: resolvedSpec,
        kind: 'text',
        summary: 'rendered-hello',
        via: 'session' as const
      }),
      resolve: async () => ({ status: 'missing' as const, id: 'rm_0123456789abcdef0123', kind: 'unknown', summary: '', via: 'none' as const }),
      dispose() {}
    };
    await act(async () => {
      installFenceRenderer({ chat: chat as never, artifacts: artifacts as never, sendAction: () => {} });
      await tick();
    });
    expect(document.body.textContent).toContain('rendered-hello');
  });

  it('retracts a preview when the step stops being the final answer', async () => {
    hostDom('assistant-step', 'rich-msg', DOC);
    const chat = fakeChat(facts());
    let dispose: () => void = () => {};
    await act(async () => {
      dispose = installFenceRenderer({ chat: chat as never, artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never, sendAction: () => {} });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(1);
    // The model started a tool call: the row is no longer the closing answer.
    chat.factsForRow = () => facts({ finality: 'not-final' });
    await act(async () => {
      chat.notify();
      await tick();
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    await act(async () => {
      dispose();
      await tick();
    });
  });

  it('ignores ordinary code blocks', async () => {
    const { source } = hostDom('assistant-step', 'ts', 'const x: number = 1;');
    await act(async () => {
      installFenceRenderer({ chat: fakeChat(facts()) as never, artifacts: fakeArtifacts({ status: 'missing', id: '' }) as never, sendAction: () => {} });
      await tick();
    });
    expect(document.querySelectorAll('[data-rich-msg-root]')).toHaveLength(0);
    expect(source.hidden).toBe(false);
  });
});
