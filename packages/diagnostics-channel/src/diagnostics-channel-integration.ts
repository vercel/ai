import * as diagnostics_channel from 'node:diagnostics_channel';
import type { TelemetryIntegration } from 'ai';

/**
 * Well-known diagnostics channel names published by this integration.
 *
 * APM vendors (Datadog, New Relic, etc.) subscribe to these channels
 * to instrument AI SDK operations without requiring users to register
 * additional callbacks.
 */
export const AI_SDK_CHANNEL_NAMES = {
  operationStart: 'ai-sdk:operation:start',
  stepStart: 'ai-sdk:step:start',
  toolCallStart: 'ai-sdk:tool-call:start',
  toolCallFinish: 'ai-sdk:tool-call:finish',
  chunk: 'ai-sdk:chunk',
  stepFinish: 'ai-sdk:step:finish',
  embedStart: 'ai-sdk:embed:start',
  embedFinish: 'ai-sdk:embed:finish',
  rerankStart: 'ai-sdk:rerank:start',
  rerankFinish: 'ai-sdk:rerank:finish',
  objectStepStart: 'ai-sdk:object-step:start',
  objectStepFinish: 'ai-sdk:object-step:finish',
  operationFinish: 'ai-sdk:operation:finish',
  error: 'ai-sdk:error',
} as const;

export type DiagnosticsChannelName =
  (typeof AI_SDK_CHANNEL_NAMES)[keyof typeof AI_SDK_CHANNEL_NAMES];

const channels = {
  operationStart: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.operationStart,
  ),
  stepStart: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.stepStart),
  toolCallStart: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.toolCallStart,
  ),
  toolCallFinish: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.toolCallFinish,
  ),
  chunk: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.chunk),
  stepFinish: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.stepFinish),
  embedStart: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.embedStart),
  embedFinish: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.embedFinish),
  rerankStart: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.rerankStart),
  rerankFinish: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.rerankFinish),
  objectStepStart: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.objectStepStart,
  ),
  objectStepFinish: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.objectStepFinish,
  ),
  operationFinish: diagnostics_channel.channel(
    AI_SDK_CHANNEL_NAMES.operationFinish,
  ),
  error: diagnostics_channel.channel(AI_SDK_CHANNEL_NAMES.error),
};

/**
 * Creates a `TelemetryIntegration` that publishes AI SDK lifecycle events
 * to Node.js diagnostics channels.
 *
 * Instrumentation tools (Datadog, New Relic, OpenTelemetry collectors, etc.)
 * can subscribe to the well-known channel names exported as
 * `AI_SDK_CHANNEL_NAMES` to observe operations without any coupling to the
 * AI SDK's callback system.
 *
 * When no subscribers are present on a channel, publishing is a no-op
 * (the `hasSubscribers` guard makes this zero-cost).
 *
 * @example
 * ```ts
 * import { registerTelemetryIntegration } from 'ai';
 * import { createDiagnosticsChannelIntegration } from '@ai-sdk/diagnostics-channel';
 *
 * registerTelemetryIntegration(createDiagnosticsChannelIntegration());
 * ```
 */
export function createDiagnosticsChannelIntegration(): TelemetryIntegration {
  return {
    onStart(event) {
      if (channels.operationStart.hasSubscribers) {
        channels.operationStart.publish(event);
      }
    },

    onStepStart(event) {
      if (channels.stepStart.hasSubscribers) {
        channels.stepStart.publish(event);
      }
    },

    onToolCallStart(event) {
      if (channels.toolCallStart.hasSubscribers) {
        channels.toolCallStart.publish(event);
      }
    },

    onToolCallFinish(event) {
      if (channels.toolCallFinish.hasSubscribers) {
        channels.toolCallFinish.publish(event);
      }
    },

    onChunk(event) {
      if (channels.chunk.hasSubscribers) {
        channels.chunk.publish(event);
      }
    },

    onStepFinish(event) {
      if (channels.stepFinish.hasSubscribers) {
        channels.stepFinish.publish(event);
      }
    },

    onObjectStepStart(event) {
      if (channels.objectStepStart.hasSubscribers) {
        channels.objectStepStart.publish(event);
      }
    },

    onObjectStepFinish(event) {
      if (channels.objectStepFinish.hasSubscribers) {
        channels.objectStepFinish.publish(event);
      }
    },

    onEmbedStart(event) {
      if (channels.embedStart.hasSubscribers) {
        channels.embedStart.publish(event);
      }
    },

    onEmbedFinish(event) {
      if (channels.embedFinish.hasSubscribers) {
        channels.embedFinish.publish(event);
      }
    },

    onRerankStart(event) {
      if (channels.rerankStart.hasSubscribers) {
        channels.rerankStart.publish(event);
      }
    },

    onRerankFinish(event) {
      if (channels.rerankFinish.hasSubscribers) {
        channels.rerankFinish.publish(event);
      }
    },

    onFinish(event) {
      if (channels.operationFinish.hasSubscribers) {
        channels.operationFinish.publish(event);
      }
    },

    onError(event) {
      if (channels.error.hasSubscribers) {
        channels.error.publish(event);
      }
    },
  };
}
