import { describe, expect, it } from 'vitest';
import { ChatView, viewedSessionId } from '../../src/client/chat-view';

/** Build a fake sessions service with one main-view session. */
function fakeSessions(sessionId: string) {
  const ids = [sessionId];
  return {
    list: { getSnapshot: () => ({ ids }) },
    retainInfo: (id: string) => ({ getSnapshot: () => ({ retainedBy: { mainView: id === sessionId ? 1 : 0 } }) }),
    scope: (id: string) => ({ get: (name: string) => (name === 'conversation' ? { send: async () => {} } : undefined) })
  };
}

function node(key: string, kind: string, anchorSeq: number, data: Record<string, unknown>, turn = 1) {
  return {
    key,
    kind,
    anchorSeq,
    location: { kind: 'step', turn: { turn }, step: { step: 1 } },
    data
  };
}

function snapshotOf(nodes: unknown[]) {
  const map = new Map<string, unknown>();
  for (const item of nodes) {
    const record = item as { key: string };
    map.set(record.key, item);
  }
  return { nodes: { get: (key: string) => map.get(key), values: () => [...map.values()] } };
}

function fakeUi(snapshot: unknown) {
  return {
    binding: () => ({
      target: () => ({ getSnapshot: () => snapshot, subscribe: () => () => {} })
    })
  };
}

/** Minimal fake row: only getAttribute is read. */
function row(attrs: Record<string, string>): HTMLElement {
  return { getAttribute: (name: string) => attrs[name] ?? null } as unknown as HTMLElement;
}

const DOC = JSON.stringify({ version: 1, nodes: [{ type: 'text', content: 'hello' }] });
const ARTIFACT_ID = 'rm_0123456789abcdef0123';

describe('chat snapshot adapter', () => {
  it('finds the main-view session', () => {
    expect(viewedSessionId(fakeSessions('s1') as never)).toBe('s1');
    expect(viewedSessionId(undefined)).toBeUndefined();
  });

  it('classifies the last settled assistant step as final', () => {
    const snapshot = snapshotOf([
      { key: 't', kind: 'tool-call', anchorSeq: 20, location: { kind: 'step', turn: { turn: 1 } }, data: {} },
      node('a', 'assistant-step', 30, { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: 'hello ' + DOC }] })
    ]);
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => fakeUi(snapshot) as never });
    const facts = chat.factsForRow(row({ 'data-chat-node-key': 'a' }), DOC);
    expect(facts?.finality).toBe('final');
    expect(facts?.fenceLocation).toBe('text');
    expect(facts?.turn).toBe(1);
  });

  it('rejects an intermediate step that precedes a tool call', () => {
    const snapshot = snapshotOf([
      node('a', 'assistant-step', 10, { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: DOC }] }),
      node('b', 'assistant-step', 30, { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: 'final' }] }),
      { key: 't', kind: 'tool-call', anchorSeq: 40, location: { kind: 'step', turn: { turn: 1 } }, data: {} }
    ]);
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => fakeUi(snapshot) as never });
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'a' }), DOC)?.finality).toBe('not-final');
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'b' }), 'final')?.finality).toBe('not-final');
  });

  it('marks a running final step as streaming-final', () => {
    const snapshot = snapshotOf([
      node('a', 'assistant-step', 10, { status: 'running', turn: 1, blocks: [{ kind: 'text', text: DOC }] })
    ]);
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => fakeUi(snapshot) as never });
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'a' }), DOC)?.finality).toBe('streaming-final');
  });

  it('separates reasoning fences from answer fences', () => {
    const snapshot = snapshotOf([
      node('a', 'assistant-step', 10, {
        status: 'settled',
        turn: 1,
        blocks: [
          { kind: 'reasoning', text: 'thinking ' + DOC },
          { kind: 'text', text: 'answer ' + DOC }
        ]
      })
    ]);
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => fakeUi(snapshot) as never });
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'a' }), DOC)?.fenceLocation).toBe('text');
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'a' }), 'thinking only ' + DOC.replace('hello', 'reasoning-only'))?.fenceLocation).toBe('unknown');
  });

  it('indexes published artifacts from tool results and their call arguments', () => {
    const snapshot = snapshotOf([
      {
        key: 'tool',
        kind: 'tool-call',
        anchorSeq: 20,
        location: { kind: 'step', turn: { turn: 1 } },
        data: {
          root: {
            kind: 'tool-result',
            name: 'rich_msg_publish',
            isError: false,
            content: [{ type: 'text', text: JSON.stringify({ ok: true, id: ARTIFACT_ID, kind: 'text', summary: 'hello' }) }],
            args: { text: (key: string) => (key === 'document' ? DOC : undefined) }
          }
        }
      }
    ]);
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => fakeUi(snapshot) as never });
    const artifacts = chat.artifactsOf(snapshot as never);
    expect(artifacts.get(ARTIFACT_ID)?.spec).toBeDefined();
    expect(artifacts.get(ARTIFACT_ID)?.summary).toBe('hello');
  });

  it('returns undefined without a readable chat target', () => {
    const chat = new ChatView({ getSessions: () => fakeSessions('s1') as never, getUiConversation: () => undefined });
    expect(chat.factsForRow(row({ 'data-chat-node-key': 'a' }), DOC)).toBeUndefined();
  });
});
