/**
 * Action relay for rendered rich controls.
 *
 * A viewer activation has exactly one host channel: a plain user message. The
 * relay formats the documented envelope, sends it through the session-scoped
 * conversation service, and never retries, logs payloads or resolves model
 * tools on its own. Payload size is capped, the session is captured when the
 * block mounts (never looked up again at click time), and a missing session
 * simply disables the send.
 *
 * @module dsh-rich-msg/client/actions
 */
import { formatActionText } from '../shared/protocol.ts';
import type { SessionsLike } from './chat-view.ts';

/** Send one user-visible message into a session. */
export interface ConversationFace {
  send?(text: string): Promise<unknown>;
}

/** Read the conversation face of a session scope. */
function conversationOf(sessions: SessionsLike | undefined, sessionId: string | undefined): ConversationFace | undefined {
  if (sessions === undefined || sessionId === undefined) return undefined;
  try {
    const scope = sessions.scope?.(sessionId);
    const conversation = scope?.get?.('conversation');
    if (conversation !== null && typeof conversation === 'object' && typeof (conversation as ConversationFace).send === 'function') {
      return conversation as ConversationFace;
    }
  } catch {
    /* A released session binding simply has no conversation face. */
  }
  return undefined;
}

/** Build one relay bound to the live session services. */
export function createActionRelay(deps: { getSessions: () => SessionsLike | undefined }): {
  send(sessionId: string | undefined, action: string, payload?: unknown): void;
} {
  return {
    send(sessionId, action, payload) {
      const text = formatActionText(action, payload);
      if (text === null) return;
      const conversation = conversationOf(deps.getSessions(), sessionId);
      if (conversation?.send === undefined) return;
      void conversation.send(text).catch(() => {
        // Never log the payload: form values can contain private information.
        console.warn('[dsh-rich-msg] action delivery failed');
      });
    }
  };
}
