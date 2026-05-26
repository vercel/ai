import type { HarnessV1StreamPart } from '../../v1';
import type { TextStreamPart } from 'ai';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * Translate one event from the harness wire format to the AI SDK
 * `TextStreamPart` shape consumed by `streamText` callers.
 *
 * The translation is intentionally close to the identity function — V4
 * primitives (`LanguageModelV4ToolCall`, `LanguageModelV4ToolResult`,
 * `LanguageModelV4ToolApprovalRequest`, `LanguageModelV4FinishReason`,
 * `LanguageModelV4Usage`) flow through unchanged. The only adapters are:
 *   - `harnessMetadata` → `providerMetadata`
 *   - harness-only `nativeName` / `observeOnly` on tool calls are dropped
 *     (host consumers don't see them; they are an internal adapter signal)
 *   - the harness `raw` part is forwarded as the AI SDK `raw` part
 *
 * Returns `null` when the event has no consumer-facing AI SDK equivalent
 * (e.g. `stream-start` is consumed by the agent itself, not forwarded).
 */
export function translateStreamPart<TOOLS extends ToolSet>(
  event: HarnessV1StreamPart,
): TextStreamPart<TOOLS> | null {
  switch (event.type) {
    case 'stream-start':
      // The agent emits its own `start` part with normalized warnings;
      // the harness-level start signal is consumed internally.
      return null;

    case 'text-start':
      return {
        type: 'text-start',
        id: event.id,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'text-delta':
      return {
        type: 'text-delta',
        id: event.id,
        text: event.delta,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'text-end':
      return {
        type: 'text-end',
        id: event.id,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'reasoning-start':
      return {
        type: 'reasoning-start',
        id: event.id,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'reasoning-delta':
      return {
        type: 'reasoning-delta',
        id: event.id,
        text: event.delta,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'reasoning-end':
      return {
        type: 'reasoning-end',
        id: event.id,
        // `providerMetadata` and `harnessMetadata` have the same shape.
        providerMetadata: event.harnessMetadata,
      } as TextStreamPart<TOOLS>;

    case 'tool-call': {
      // Strip the harness-only fields before forwarding.
      const { nativeName: _n, observeOnly: _o, ...rest } = event;
      return rest as TextStreamPart<TOOLS>;
    }

    case 'tool-approval-request':
      return {
        type: 'tool-approval-request',
        approvalId: event.approvalId,
        toolCall: {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: '',
          input: undefined,
        },
      } as TextStreamPart<TOOLS>;

    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: undefined,
        output: event.result,
        ...(event.preliminary !== undefined
          ? { preliminary: event.preliminary }
          : {}),
        ...(event.providerMetadata !== undefined
          ? { providerMetadata: event.providerMetadata }
          : {}),
      } as TextStreamPart<TOOLS>;

    case 'error':
      return { type: 'error', error: event.error } as TextStreamPart<TOOLS>;

    case 'raw':
      return { type: 'raw', rawValue: event.rawValue } as TextStreamPart<TOOLS>;

    case 'finish-step':
    case 'finish':
      // finish-step / finish are consumed by the agent's result builder, not
      // forwarded directly. The agent emits AI SDK `finish-step` / `finish`
      // parts itself once it has assembled the surrounding step / response
      // metadata.
      return null;
  }
}
