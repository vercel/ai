import { RealtimeModelV1ConversationItem } from './realtime-model-v1-conversation-item';
import { RealtimeModelV1SessionConfig } from './realtime-model-v1-session-config';

/**
 * Normalized events sent from the browser to the realtime model.
 * Each provider maps this to its native event format before sending
 * over the WebSocket.
 */
export type RealtimeModelV1ClientEvent =
  // ── Session ────────────────────────────────────────────────────────

  | {
      type: 'session-update';
      config: RealtimeModelV1SessionConfig;
    }

  // ── Input audio buffer ─────────────────────────────────────────────
  | {
      type: 'input-audio-append';

      /**
       * Base64-encoded audio chunk to append to the input buffer.
       */
      audio: string;
    }
  | {
      type: 'input-audio-commit';
    }
  | {
      type: 'input-audio-clear';
    }

  // ── Conversation items ─────────────────────────────────────────────
  | {
      type: 'conversation-item-create';
      item: RealtimeModelV1ConversationItem;
    }
  | {
      type: 'conversation-item-truncate';

      /**
       * The ID of the assistant message item to truncate.
       */
      itemId: string;

      /**
       * The index of the content part to truncate.
       */
      contentIndex: number;

      /**
       * Truncate audio after this many milliseconds.
       */
      audioEndMs: number;
    }

  // ── Response control ───────────────────────────────────────────────
  | {
      type: 'response-create';
      options?: {
        modalities?: string[];
        instructions?: string;
        metadata?: Record<string, unknown>;
      };
    }
  | {
      type: 'response-cancel';
    };
