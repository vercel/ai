import type {
  LanguageModelV4Message,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  convertDataContentToBase64String,
  type Experimental_DecisionState as DecisionState,
  type Experimental_DecisionStatePart as DecisionStatePart,
  type FilePart,
} from 'ai';

/**
 * Helper utility to serialize prompt content for OpenTelemetry tracing.
 * It is initially created because normalized LanguageModelV4Prompt carries
 * images as Uint8Arrays, on which JSON.stringify acts weirdly, converting
 * them to objects with stringified indices as keys, e.g. {"0": 42, "1": 69 }.
 */
export function stringifyForTelemetry(prompt: LanguageModelV4Prompt): string {
  return JSON.stringify(
    prompt.map((message: LanguageModelV4Message) => ({
      ...message,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map(part =>
              part.type === 'file'
                ? {
                    ...part,
                    data: serializeFileData(part.data),
                  }
                : part,
            ),
    })),
  );
}

function isDecisionStateParts(
  state: DecisionState,
): state is readonly DecisionStatePart[] {
  return Array.isArray(state);
}

/** Serialize decision files using the same representation as prompt files. */
export function stringifyDecisionStateForTelemetry(
  state: DecisionState,
): string {
  return JSON.stringify(
    isDecisionStateParts(state)
      ? state.map(part =>
          part.type === 'file'
            ? { ...part, data: serializeFileData(part.data) }
            : part,
        )
      : state,
  );
}

function serializeFileData(data: FilePart['data']): unknown {
  if (typeof data === 'string') return data;
  if (data instanceof URL) return data.toString();
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return convertDataContentToBase64String(data);
  }
  switch (data.type) {
    case 'data':
      return convertDataContentToBase64String(data.data);
    case 'url':
      return data.url.toString();
    case 'reference':
      return data.reference;
    case 'text':
      return data.text;
    default:
      return data;
  }
}
