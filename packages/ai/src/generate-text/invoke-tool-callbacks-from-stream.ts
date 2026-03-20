import { UglyTransformedStreamTextPart } from './create-stream-text-part-transform';
import { ToolSet } from './tool-set';
import { ModelMessage } from '@ai-sdk/provider-utils';

export function invokeToolCallbacksFromStream<TOOLS extends ToolSet>({
  stepInputMessages,
  stream,
  tools,
  abortSignal,
  experimental_context,
}: {
  stepInputMessages: Array<ModelMessage>;
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
  stream: ReadableStream<UglyTransformedStreamTextPart<TOOLS>>;
  tools: TOOLS | undefined;
}): ReadableStream<UglyTransformedStreamTextPart<TOOLS>> {
  if (tools == null) return stream;

  const ongoingToolCallToolNames: Record<string, string> = {};

  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
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

            // TODO MIGRATE
            controller.enqueue({
              ...chunk,
              dynamic: chunk.dynamic ?? tool?.type === 'dynamic',
              title: tool?.title,
            });
            break;
          }

          case 'tool-input-end': {
            delete ongoingToolCallToolNames[chunk.id];
            controller.enqueue(chunk);
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

            controller.enqueue(chunk);
            break;
          }

          default: {
            controller.enqueue(chunk);
            break;
          }
        }
      },
    }),
  );
}
