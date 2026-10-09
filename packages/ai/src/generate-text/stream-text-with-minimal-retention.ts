import { asArray, type Context, type ToolSet } from '@ai-sdk/provider-utils';
import { getGlobalTelemetryIntegrations } from '../telemetry/telemetry-registry';
import type { Output } from './output';
import { streamText } from './stream-text';
import type { StreamTextResult } from './stream-text-result';

/** A single-consumer view of a text generation, without replay or final content getters. */
export type StreamingTextResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> = Pick<
  StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
  | 'textStream'
  | 'stream'
  | 'fullStream'
  | 'partialOutputStream'
  | 'elementStream'
  | 'totalUsage'
  | 'usage'
  | 'finishReason'
  | 'rawFinishReason'
  | 'consumeStream'
  | 'toUIMessageStream'
  | 'toUIMessageStreamResponse'
  | 'toTextStreamResponse'
  | 'pipeUIMessageStreamToResponse'
  | 'pipeTextStreamToResponse'
>;

/**
 * Uses the streamText execution engine with one stream consumer and no replay
 * buffer. Content is collected only when required by configured features.
 * Metadata promises observe completion; they do not start another consumer.
 *
 * Tools, structured output, step preparation, and full-content callbacks retain
 * the content their contracts require. Plain text/reasoning streaming does not.
 */
export function streamTextWithMinimalRetention<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
  OUTPUT extends Output = Output<string, string, never>,
>(
  options: Parameters<typeof streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0],
): StreamingTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  const telemetry = options.telemetry ?? options.experimental_telemetry;
  const integrations =
    telemetry?.integrations != null
      ? asArray(telemetry.integrations)
      : getGlobalTelemetryIntegrations();

  // Determine collection before execution, never from the order of getter
  // access. Preserve complete data for every existing callback and tool loop.
  const collectContent =
    (options.tools != null && Object.keys(options.tools).length > 0) ||
    options.toolChoice != null ||
    options.output != null ||
    options.prepareStep != null ||
    options.stopWhen != null ||
    options.onEnd != null ||
    options.onFinish != null ||
    options.onStepEnd != null ||
    options.onStepFinish != null ||
    options.onAbort != null ||
    options.onLanguageModelCallEnd != null ||
    options.experimental_onLanguageModelCallEnd != null ||
    (telemetry?.isEnabled !== false && integrations.length > 0);

  const result = streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>({
    ...options,
    _internal: {
      ...options._internal,
      retention: { replay: false, collectContent },
    },
  });

  // A concrete facade also prevents untyped callers from accidentally reading
  // a final-content getter when no result collector was configured.
  return {
    get textStream() {
      return result.textStream;
    },
    get stream() {
      return result.stream;
    },
    get fullStream() {
      return result.fullStream;
    },
    get partialOutputStream() {
      return result.partialOutputStream;
    },
    get elementStream() {
      return result.elementStream;
    },
    get totalUsage() {
      return result.totalUsage;
    },
    get usage() {
      return result.usage;
    },
    get finishReason() {
      return result.finishReason;
    },
    get rawFinishReason() {
      return result.rawFinishReason;
    },
    consumeStream: result.consumeStream.bind(result),
    toUIMessageStream: result.toUIMessageStream.bind(result),
    toUIMessageStreamResponse: result.toUIMessageStreamResponse.bind(result),
    toTextStreamResponse: result.toTextStreamResponse.bind(result),
    pipeUIMessageStreamToResponse:
      result.pipeUIMessageStreamToResponse.bind(result),
    pipeTextStreamToResponse: result.pipeTextStreamToResponse.bind(result),
  };
}
