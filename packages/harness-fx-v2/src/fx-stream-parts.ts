import type { HarnessV2Metadata, HarnessV2StreamPart } from '@ai-sdk/harness';
import type { JSONObject } from '@ai-sdk/provider';
import type { FxModelStreamPart } from './fx-model-response';

/**
 * Returns a value as provider metadata, or `undefined`.
 */
function asMetadata(value: unknown): Record<string, JSONObject> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, JSONObject>)
    : undefined;
}

/**
 * Returns the message of an error stream part's error.
 */
function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return JSON.stringify(error) ?? 'The model stream failed.';
}

/**
 * Translates one language model stream part of an AI Gateway model
 * response into harness stream parts.
 *
 * Text and reasoning parts keep their IDs, with provider metadata as
 * harness metadata. Tool input and tool call parts are passed through, and
 * marked `providerExecuted` for built-in tools, which the harness runs
 * rather than the host. `error` parts carry the error's message. Parts
 * without a harness counterpart (e.g. `stream-start`, `response-metadata`,
 * `finish`, `custom`, `source` or provider tool results) return nothing:
 * steps and turns end through `finishStep()` and `finishTurn()`.
 */
export function translateFxStreamPart(options: {
  /**
   * Stream part to translate.
   */
  part: FxModelStreamPart;

  /**
   * Whether a tool name refers to one of the harness's built-in tools.
   */
  isBuiltinTool: (toolName: string) => boolean;
}): HarnessV2StreamPart[] {
  const { part, isBuiltinTool } = options;
  const id = typeof part.id === 'string' ? part.id : undefined;
  const harnessMetadata = asMetadata(part.providerMetadata) as
    | HarnessV2Metadata
    | undefined;
  const providerMetadata = asMetadata(part.providerMetadata);
  const withHarnessMetadata = <T extends object>(value: T) =>
    harnessMetadata == null ? value : { ...value, harnessMetadata };
  const withProviderMetadata = <T extends object>(value: T) =>
    providerMetadata == null ? value : { ...value, providerMetadata };

  switch (part.type) {
    case 'text-start':
    case 'text-end':
    case 'reasoning-start':
    case 'reasoning-end':
      if (id == null) return [];
      return [withHarnessMetadata({ type: part.type, id })];
    case 'text-delta':
    case 'reasoning-delta':
      if (id == null || typeof part.delta !== 'string') return [];
      return [withHarnessMetadata({ type: part.type, id, delta: part.delta })];
    case 'tool-input-start': {
      if (id == null || typeof part.toolName !== 'string') return [];
      const start: HarnessV2StreamPart & { type: 'tool-input-start' } =
        withProviderMetadata({
          type: 'tool-input-start' as const,
          id,
          toolName: part.toolName,
        });
      if (isBuiltinTool(part.toolName)) start.providerExecuted = true;
      return [start];
    }
    case 'tool-input-delta':
      if (id == null || typeof part.delta !== 'string') return [];
      return [
        withProviderMetadata({
          type: 'tool-input-delta' as const,
          id,
          delta: part.delta,
        }),
      ];
    case 'tool-input-end':
      if (id == null) return [];
      return [withProviderMetadata({ type: 'tool-input-end' as const, id })];
    case 'tool-call': {
      if (
        typeof part.toolCallId !== 'string' ||
        typeof part.toolName !== 'string'
      ) {
        return [];
      }
      const call: HarnessV2StreamPart & { type: 'tool-call' } =
        withProviderMetadata({
          type: 'tool-call' as const,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input:
            typeof part.input === 'string'
              ? part.input
              : JSON.stringify(part.input ?? {}),
        });
      if (isBuiltinTool(part.toolName)) call.providerExecuted = true;
      return [call];
    }
    case 'error':
      return [
        { type: 'error', error: { message: getErrorMessage(part.error) } },
      ];
    default:
      return [];
  }
}
