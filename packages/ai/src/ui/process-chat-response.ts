import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { processDataStream } from '../data-stream/process-data-stream';
import { parsePartialJson } from '../util/parse-partial-json';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import type {
  ReasoningUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';
import { UseChatOptions } from './use-chat';
import { mergeObjects } from '../util/merge-objects';

export async function processChatResponse({
  stream,
  update,
  onToolCall,
  onFinish,
  lastMessage,
  generateId = generateIdFunction,
}: {
  stream: ReadableStream<Uint8Array>;
  update: (options: { message: UIMessage }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: { message: UIMessage }) => void;
  generateId?: () => string;
  lastMessage: UIMessage | undefined;
}) {
  const replaceLastMessage = lastMessage?.role === 'assistant';

  let step = replaceLastMessage
    ? 1 + (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
    : 0;

  const message: UIMessage = replaceLastMessage
    ? structuredClone(lastMessage)
    : {
        id: generateId(),
        role: 'assistant',
        parts: [],
      };

  let currentTextPart: TextUIPart | undefined = undefined;
  let currentReasoningPart: ReasoningUIPart | undefined = undefined;

  function updateToolInvocationPart(
    toolCallId: string,
    invocation: ToolInvocation,
  ) {
    const part = message.parts.find(
      part =>
        part.type === 'tool-invocation' &&
        part.toolInvocation.toolCallId === toolCallId,
    ) as ToolInvocationUIPart | undefined;

    if (part != null) {
      part.toolInvocation = invocation;
    } else {
      message.parts.push({
        type: 'tool-invocation',
        toolInvocation: invocation,
      });
    }
  }

  // keep track of partial tool calls
  const partialToolCalls: Record<
    string,
    { text: string; step: number; index: number; toolName: string }
  > = {};

  function execUpdate() {
    const copiedMessage = {
      // deep copy the message to ensure that deep changes (msg attachments) are updated
      // with SolidJS. SolidJS uses referential integration of sub-objects to detect changes.
      ...structuredClone(message),
      // add a revision id to ensure that the message is updated with SWR. SWR uses a
      // hashing approach by default to detect changes, but it only works for shallow
      // changes. This is why we need to add a revision id to ensure that the message
      // is updated with SWR (without it, the changes get stuck in SWR and are not
      // forwarded to rendering):
      revisionId: generateId(),
    } as UIMessage;

    update({
      message: copiedMessage,
    });
  }

  await processDataStream({
    stream,
    onTextPart(value) {
      if (currentTextPart == null) {
        currentTextPart = {
          type: 'text',
          text: value,
        };
        message.parts.push(currentTextPart);
      } else {
        currentTextPart.text += value;
      }

      execUpdate();
    },
    onReasoningPart(value) {
      if (currentReasoningPart == null) {
        currentReasoningPart = {
          type: 'reasoning',
          text: value.text,
          providerMetadata: value.providerMetadata,
        };
        message.parts.push(currentReasoningPart);
      } else {
        currentReasoningPart.text += value.text;
        currentReasoningPart.providerMetadata = value.providerMetadata;
      }

      execUpdate();
    },
    onReasoningPartFinish(value) {
      if (currentReasoningPart != null) {
        currentReasoningPart = undefined;
      }
    },
    onFilePart(value) {
      message.parts.push({
        type: 'file',
        mediaType: value.mediaType,
        url: value.url,
      });

      execUpdate();
    },
    onSourcePart(value) {
      message.parts.push({
        type: 'source',
        source: value,
      });

      execUpdate();
    },
    onToolCallStreamingStartPart(value) {
      const toolInvocations = getToolInvocations(message);

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        step,
        toolName: value.toolName,
        index: toolInvocations.length,
      };

      updateToolInvocationPart(value.toolCallId, {
        state: 'partial-call',
        step,
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: undefined,
      } as const);

      execUpdate();
    },
    async onToolCallDeltaPart(value) {
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = await parsePartialJson(
        partialToolCall.text,
      );

      updateToolInvocationPart(value.toolCallId, {
        state: 'partial-call',
        step: partialToolCall.step,
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      } as const);

      execUpdate();
    },
    async onToolCallPart(value) {
      updateToolInvocationPart(value.toolCallId, {
        state: 'call',
        step,
        ...value,
      } as const);

      execUpdate();

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({
          toolCall: value,
        });
        if (result != null) {
          updateToolInvocationPart(value.toolCallId, {
            state: 'result',
            step,
            ...value,
            result,
          } as const);

          execUpdate();
        }
      }
    },
    onToolResultPart(value) {
      const toolInvocations = getToolInvocations(message);

      if (toolInvocations == null) {
        throw new Error('tool_result must be preceded by a tool_call');
      }

      // find if there is any tool invocation with the same toolCallId
      // and replace it with the result
      const toolInvocationIndex = toolInvocations.findIndex(
        invocation => invocation.toolCallId === value.toolCallId,
      );

      if (toolInvocationIndex === -1) {
        throw new Error(
          'tool_result must be preceded by a tool_call with the same toolCallId',
        );
      }

      updateToolInvocationPart(value.toolCallId, {
        ...toolInvocations[toolInvocationIndex],
        state: 'result' as const,
        ...value,
      } as const);

      execUpdate();
    },
    onStartStepPart(value) {
      // add a step boundary part to the message
      message.parts.push({ type: 'step-start' });

      if (value.metadata != null) {
        message.metadata =
          message.metadata != null
            ? mergeObjects(message.metadata, value.metadata)
            : value.metadata;
      }

      execUpdate();
    },
    onFinishStepPart(value) {
      step += 1;

      // reset the current text and reasoning parts
      currentTextPart = undefined;
      currentReasoningPart = undefined;

      if (value.metadata != null) {
        message.metadata =
          message.metadata != null
            ? mergeObjects(message.metadata, value.metadata)
            : value.metadata;
      }

      execUpdate();
    },
    onStartPart(value) {
      if (value.messageId != null) {
        message.id = value.messageId;
      }

      if (value.metadata != null) {
        message.metadata =
          message.metadata != null
            ? mergeObjects(message.metadata, value.metadata)
            : value.metadata;
      }
      execUpdate();
    },
    onFinishPart(value) {
      if (value.metadata != null) {
        message.metadata =
          message.metadata != null
            ? mergeObjects(message.metadata, value.metadata)
            : value.metadata;
      }

      execUpdate();
    },
    onErrorPart(error) {
      throw new Error(error);
    },
  });

  onFinish?.({ message });
}
