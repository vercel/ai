import type { FileUIPart, TextUIPart, UIMessage } from 'ai';

/**
 * A prompt queued while a turn is running, waiting to appear in the stream as a
 * delivered `steering-message` part.
 */
export type QueuedPrompt = {
  id: string;
  parts: Array<TextUIPart | FileUIPart>;
  queuedAtSteeringCount: number;
};

/**
 * What the browser keeps of a chat, so that a reload (e.g. the one `next dev`
 * triggers after the server restarted) restores it: its messages, whether a
 * turn was in progress (which the reloaded chat then reconnects to), and any
 * queued follow-up prompts not yet delivered.
 */
export type StoredChatState<MESSAGE extends UIMessage> = {
  messages: MESSAGE[];
  turnInProgress: boolean;
  queuedPrompts?: QueuedPrompt[];
};

function storageKeyFor({ chatId }: { chatId: string }): string {
  return `durable-harness-chat-state:${chatId}`;
}

/**
 * Reads the state of a chat from session storage.
 */
export function readStoredChatState<MESSAGE extends UIMessage>({
  chatId,
}: {
  chatId: string;
}): StoredChatState<MESSAGE> | undefined {
  const text = window.sessionStorage.getItem(storageKeyFor({ chatId }));
  if (text == null) return undefined;
  try {
    const value = JSON.parse(text) as Partial<StoredChatState<MESSAGE>>;
    if (
      !Array.isArray(value.messages) ||
      typeof value.turnInProgress !== 'boolean'
    ) {
      return undefined;
    }
    return {
      messages: value.messages,
      turnInProgress: value.turnInProgress,
      ...(Array.isArray(value.queuedPrompts) && {
        queuedPrompts: value.queuedPrompts,
      }),
    };
  } catch {
    return undefined;
  }
}

/**
 * Writes the state of a chat to session storage.
 */
export function writeStoredChatState<MESSAGE extends UIMessage>({
  chatId,
  state,
}: {
  chatId: string;
  state: StoredChatState<MESSAGE>;
}): void {
  window.sessionStorage.setItem(
    storageKeyFor({ chatId }),
    JSON.stringify(state),
  );
}

/**
 * Removes the state of a chat from session storage.
 */
export function clearStoredChatState({ chatId }: { chatId: string }): void {
  window.sessionStorage.removeItem(storageKeyFor({ chatId }));
}
