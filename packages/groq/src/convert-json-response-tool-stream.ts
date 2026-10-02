import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

/** Converts the internal response tool into structured text. */
export function convertJsonResponseToolStream(toolName: string) {
  const responseToolIds = new Set<string>();
  const responseToolsWithDeltas = new Set<string>();
  let hasResponseTool = false;
  let hasApplicationTool = false;

  return new TransformStream<
    LanguageModelV4StreamPart,
    LanguageModelV4StreamPart
  >({
    transform(part, controller) {
      switch (part.type) {
        case 'text-start':
        case 'text-delta':
        case 'text-end':
          // The response tool supplies the output; omit conversational text.
          return;
        case 'tool-input-start':
          if (part.toolName === toolName) {
            responseToolIds.add(part.id);
            controller.enqueue({
              type: 'text-start',
              id: part.id,
              ...(part.providerMetadata && {
                providerMetadata: part.providerMetadata,
              }),
            });
            return;
          }
          break;
        case 'tool-input-delta':
          if (responseToolIds.has(part.id)) {
            if (part.delta.length > 0) responseToolsWithDeltas.add(part.id);
            controller.enqueue({
              type: 'text-delta',
              id: part.id,
              delta: part.delta,
              ...(part.providerMetadata && {
                providerMetadata: part.providerMetadata,
              }),
            });
            return;
          }
          break;
        case 'tool-input-end':
          if (responseToolIds.has(part.id)) return;
          break;
        case 'tool-call':
          if (part.toolName === toolName) {
            if (!responseToolsWithDeltas.has(part.toolCallId)) {
              controller.enqueue({
                type: 'text-delta',
                id: part.toolCallId,
                delta: part.input,
                ...(part.providerMetadata && {
                  providerMetadata: part.providerMetadata,
                }),
              });
            }
            controller.enqueue({
              type: 'text-end',
              id: part.toolCallId,
              ...(part.providerMetadata && {
                providerMetadata: part.providerMetadata,
              }),
            });
            hasResponseTool = true;
            return;
          }
          if (!part.providerExecuted) {
            hasApplicationTool = true;
          }
          break;
        case 'finish':
          if (
            hasResponseTool &&
            !hasApplicationTool &&
            part.finishReason.unified === 'tool-calls'
          ) {
            controller.enqueue({
              ...part,
              finishReason: { ...part.finishReason, unified: 'stop' },
            });
            return;
          }
          break;
      }
      controller.enqueue(part);
    },
  });
}
