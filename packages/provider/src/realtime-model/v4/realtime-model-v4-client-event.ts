import type { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import type { RealtimeModelV4ConversationItem } from './realtime-model-v4-conversation-item';
import type { RealtimeModelV4SessionConfig } from './realtime-model-v4-session-config';

/**
 * Normalized events sent from the browser to the realtime model.
 * Each provider maps this to its native event format before sending
 * over the WebSocket.
 */
export type RealtimeModelV4ClientEvent =
  // ── Session ────────────────────────────────────────────────────────

  | {
      type: 'session-update';
      config: RealtimeModelV4SessionConfig;
      eventId?: string;
    }
  | {
      type: 'session-start';
      config: RealtimeModelV4SessionConfig;
      eventId?: string;
    }
  | {
      type: 'session-close';
      eventId?: string;
    }
  | {
      type: 'input-audio-mute';
      eventId?: string;
    }
  | {
      type: 'input-audio-unmute';
      eventId?: string;
    }
  | {
      type: 'context-append';
      content: string;
      delegationId: string | null;
      eventId?: string;
      providerOptions?: SharedV4ProviderOptions;
    }

  // ── Delegated backend (requires a provider-managed backend) ──────────
  | {
      type: 'backend-tool-result';
      callId: string;
      output: string;
      eventId?: string;
    }
  | {
      type: 'backend-response-create';
      eventId?: string;
    }
  | {
      type: 'backend-input-create';
      content: Array<
        | { type: 'text'; text: string }
        | {
            type: 'image';
            url: string;
            providerOptions?: SharedV4ProviderOptions;
          }
      >;
      eventId?: string;
    }

  // ── Input audio buffer ─────────────────────────────────────────────
  | {
      type: 'input-audio-append';

      /**
       * Base64-encoded audio chunk to append to the input buffer.
       */
      audio: string;
      eventId?: string;
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
      item: RealtimeModelV4ConversationItem;
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
