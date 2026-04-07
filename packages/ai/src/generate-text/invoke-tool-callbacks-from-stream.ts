import { ModelCallStreamPart } from './stream-model-call';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { ModelMessage } from '@ai-sdk/provider-utils';

export function invokeToolCallbacksFromStream<TOOLS extends ToolSet>({
  stream,
  tools,
  stepInputMessages,
  abortSignal,
  experimental_context,
}: {
  stream: ReadableStream<ModelCallStreamPart<TOOLS>>;
  tools: TOOLS | undefined;
  stepInputMessages: Array<ModelMessage>;
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
}): ReadableStream<ModelCallStreamPart<TOOLS>> {
  if (tools == null) return stream;

  const ongoingToolCallToolNames: Record<string, string> = {};

  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        controller.enqueue(chunk);

        switch (chunk.type) {
          case 'tool-input-start': {
            ongoingToolCallToolNames[chunk.id] = chunk.toolName;

            const tool = tools?.[chunk.toolName];
            if (tool?.onInputStart != null) {
              await tool.onInputStart({
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                experimental_context,
              });
            }

            break;
          }

          case 'tool-input-delta': {
            const toolName = ongoingToolCallToolNames[chunk.id];
            const tool = tools?.[toolName];

            if (tool?.onInputDelta != null) {
              await tool.onInputDelta({
                inputTextDelta: chunk.delta,
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                experimental_context,
              });
            }

            break;
          }

          case 'tool-call': {
            const toolName = ongoingToolCallToolNames[chunk.toolCallId];
            const tool = tools?.[toolName];

            delete ongoingToolCallToolNames[chunk.toolCallId];

            if (tool?.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: chunk.input,
                toolCallId: chunk.toolCallId,
                messages: stepInputMessages,
                abortSignal,
                experimental_context,
              });
            }
          }
        }
      },
    }),
  );
}
