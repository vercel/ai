import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { OutboundMessage } from './codex-bridge-protocol';

/**
 * Translate a wire-format outbound message into a `HarnessV1StreamPart`.
 */
export function translate(message: OutboundMessage): HarnessV1StreamPart {
  switch (message.type) {
    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        result: (message.result ?? null) as Extract<
          HarnessV1StreamPart,
          { type: 'tool-result' }
        >['result'],
        ...(message.isError !== undefined ? { isError: message.isError } : {}),
        ...(message.harnessMetadata !== undefined
          ? { harnessMetadata: message.harnessMetadata }
          : {}),
      } as HarnessV1StreamPart;

    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        input: message.input,
        ...(message.nativeName !== undefined
          ? { nativeName: message.nativeName }
          : {}),
        ...(message.observeOnly !== undefined
          ? { observeOnly: message.observeOnly }
          : {}),
        ...(message.harnessMetadata !== undefined
          ? { harnessMetadata: message.harnessMetadata }
          : {}),
      } as HarnessV1StreamPart;

    default:
      return message as HarnessV1StreamPart;
  }
}
