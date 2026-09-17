import type {
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { createIdMap } from '../util/create-id-map';
import { getOwn } from '../util/get-own';
import type { LanguageModelStreamPart } from './stream-language-model-call';
import {
  isStreamRetryAttemptBoundaryPart,
  type StreamRetryAttemptBoundaryPart,
} from './stream-retry-attempt-boundary';
import { validateToolContext } from './validate-tool-context';

type ToolCallbackStreamPart<TOOLS extends ToolSet> =
  | LanguageModelStreamPart<TOOLS>
  | StreamRetryAttemptBoundaryPart;

export function invokeToolCallbacksFromStream<TOOLS extends ToolSet>({
  stream,
  tools,
  stepInputMessages,
  abortSignal,
  toolsContext,
}: {
  stream: ReadableStream<ToolCallbackStreamPart<TOOLS>>;
  tools: TOOLS | undefined;
  stepInputMessages: Array<ModelMessage>;
  abortSignal: AbortSignal | undefined;
  toolsContext: InferToolSetContext<TOOLS>;
}): ReadableStream<ToolCallbackStreamPart<TOOLS>> {
  if (tools == null) return stream;

  const ongoingToolCallToolNames: Record<string, string> = createIdMap();

  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        controller.enqueue(chunk);

        if (isStreamRetryAttemptBoundaryPart(chunk)) {
          return;
        }

        switch (chunk.type) {
          case 'tool-input-start': {
            ongoingToolCallToolNames[chunk.id] = chunk.toolName;

            const tool = getOwn(tools, chunk.toolName);
            if (tool?.onInputStart != null) {
              await tool.onInputStart({
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                context: await validateToolContext({
                  toolName: chunk.toolName,
                  context: getOwn(toolsContext, chunk.toolName),
                  contextSchema: tool.contextSchema,
                }),
              });
            }

            break;
          }

          case 'tool-input-delta': {
            const toolName = ongoingToolCallToolNames[chunk.id];
            const tool = getOwn(tools, toolName);

            if (tool?.onInputDelta != null) {
              await tool.onInputDelta({
                inputTextDelta: chunk.delta,
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                context: await validateToolContext({
                  toolName,
                  context: getOwn(toolsContext, toolName),
                  contextSchema: tool.contextSchema,
                }),
              });
            }

            break;
          }

          case 'tool-call': {
            const toolName = ongoingToolCallToolNames[chunk.toolCallId];
            const tool = getOwn(tools, toolName);

            delete ongoingToolCallToolNames[chunk.toolCallId];

            if (tool?.onInputAvailable != null) {
              await tool.onInputAvailable({
                input: chunk.input,
                toolCallId: chunk.toolCallId,
                messages: stepInputMessages,
                abortSignal,
                context: await validateToolContext({
                  toolName,
                  context: getOwn(toolsContext, toolName),
                  contextSchema: tool.contextSchema,
                }),
              });
            }
          }
        }
      },
    }),
  );
}
