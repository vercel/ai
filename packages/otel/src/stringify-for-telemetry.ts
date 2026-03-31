import {
  LanguageModelV4Message,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';

function convertUint8ArrayToBase64(data: Uint8Array): string {
  let latin1string = '';
  for (let i = 0; i < data.length; i++) {
    latin1string += String.fromCodePoint(data[i]);
  }
  return globalThis.btoa(latin1string);
}

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
                    data:
                      part.data instanceof Uint8Array
                        ? convertUint8ArrayToBase64(part.data)
                        : part.data,
                  }
                : part,
            ),
    })),
  );
}
