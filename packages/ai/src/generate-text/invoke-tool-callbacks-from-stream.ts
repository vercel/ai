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

  let ongoingToolCalls: Record<
    string,
    {
      toolName: string;
      validatedContext: Promise<unknown> | undefined;
    }
  > = createIdMap();

  const getValidatedContext = ({
    toolCallId,
    toolName,
  }: {
    toolCallId: string;
    toolName: string;
  }): Promise<unknown> => {
    const ongoingToolCall = ongoingToolCalls[toolCallId];

    if (ongoingToolCall?.validatedContext != null) {
      return ongoingToolCall.validatedContext;
    }

    const tool = getOwn(tools, toolName);
    const validatedContext = validateToolContext({
      toolName,
      context: getOwn(toolsContext, toolName),
      contextSchema: tool?.contextSchema,
    });

    if (ongoingToolCall != null) {
      ongoingToolCall.validatedContext = validatedContext;
    }

    return validatedContext;
  };

  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        controller.enqueue(chunk);

        if (isStreamRetryAttemptBoundaryPart(chunk)) {
          ongoingToolCalls = createIdMap();
          return;
        }

        switch (chunk.type) {
          case 'tool-input-start': {
            ongoingToolCalls[chunk.id] = {
              toolName: chunk.toolName,
              validatedContext: undefined,
            };

            const tool = getOwn(tools, chunk.toolName);
            if (tool?.onInputStart != null) {
              await tool.onInputStart({
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                context: await getValidatedContext({
                  toolCallId: chunk.id,
                  toolName: chunk.toolName,
                }),
              });
            }

            break;
          }

          case 'tool-input-delta': {
            const toolName = ongoingToolCalls[chunk.id]?.toolName;
            const tool = getOwn(tools, toolName);

            if (tool?.onInputDelta != null) {
              await tool.onInputDelta({
                inputTextDelta: chunk.delta,
                toolCallId: chunk.id,
                messages: stepInputMessages,
                abortSignal,
                context: await getValidatedContext({
                  toolCallId: chunk.id,
                  toolName,
                }),
              });
            }

            break;
          }

          case 'tool-call': {
            const toolName = ongoingToolCalls[chunk.toolCallId]?.toolName;
            const tool = getOwn(tools, toolName);

            if (!chunk.invalid && tool?.onInputAvailable != null) {
              const validatedContext = getValidatedContext({
                toolCallId: chunk.toolCallId,
                toolName,
              });

              delete ongoingToolCalls[chunk.toolCallId];

              await tool.onInputAvailable({
                input: chunk.input,
                toolCallId: chunk.toolCallId,
                messages: stepInputMessages,
                abortSignal,
                context: await validatedContext,
              });
            } else {
              delete ongoingToolCalls[chunk.toolCallId];
            }
          }
        }
      },
    }),
  );
}
