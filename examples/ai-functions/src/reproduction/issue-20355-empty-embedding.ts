import { tracingChannel } from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  embed,
  type Telemetry,
  type TelemetryTracingChannelMessage,
} from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';

const failureSignal =
  'ISSUE #20355 REPRODUCED: embed() resolved with undefined embedding after an empty provider response';

async function main() {
  let providerCalls = 0;
  let operationEndEvents = 0;
  let operationErrorEvents = 0;
  let tracingAsyncEndEvents = 0;
  let tracingErrorEvents = 0;
  let tracedEmbeddingType: string | undefined;

  const telemetry: Telemetry = {
    onEnd() {
      operationEndEvents++;
    },
    onError() {
      operationErrorEvents++;
    },
  };

  const channel = tracingChannel(AI_SDK_TELEMETRY_TRACING_CHANNEL);
  const subscribers = {
    start() {},
    end() {},
    asyncStart() {},
    asyncEnd(message: unknown) {
      const telemetryMessage = message as TelemetryTracingChannelMessage & {
        result?: { embedding?: unknown };
      };

      if (telemetryMessage.type === 'embed') {
        tracingAsyncEndEvents++;
        tracedEmbeddingType = typeof telemetryMessage.result?.embedding;
      }
    },
    error(message: unknown) {
      if ((message as TelemetryTracingChannelMessage).type === 'embed') {
        tracingErrorEvents++;
      }
    },
  };

  channel.subscribe(subscribers);

  let rejected = false;
  let result: Awaited<ReturnType<typeof embed>> | undefined;

  try {
    const model = new MockEmbeddingModelV4({
      doEmbed: async () => {
        providerCalls++;
        return { embeddings: [], usage: { tokens: 5 }, warnings: [] };
      },
    });

    result = await embed({
      model,
      value: 'sunny day at the beach',
      telemetry: { integrations: telemetry },
    });
  } catch {
    rejected = true;
  } finally {
    channel.unsubscribe(subscribers);
  }

  // A fixed implementation must reject at the embed() boundary instead of
  // returning a result that violates its number[] embedding contract.
  if (rejected) {
    return;
  }

  if (result == null) {
    throw new Error('embed() neither resolved with a result nor rejected');
  }

  let downstreamError: unknown;
  try {
    void result.embedding.length;
  } catch (error) {
    downstreamError = error;
  }

  console.error(failureSignal);
  console.error(
    JSON.stringify(
      {
        embeddingType: typeof result.embedding,
        usage: result.usage,
        providerCalls,
        operationEndEvents,
        operationErrorEvents,
        tracingAsyncEndEvents,
        tracingErrorEvents,
        tracedEmbeddingType,
        downstreamError:
          downstreamError instanceof Error
            ? `${downstreamError.name}: ${downstreamError.message}`
            : String(downstreamError),
      },
      null,
      2,
    ),
  );

  throw new Error(failureSignal);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
