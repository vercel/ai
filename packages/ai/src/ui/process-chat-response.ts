import {
  generateId as generateIdFunction,
  Schema,
  validateTypes,
} from '@ai-sdk/provider-utils';
import { DataStreamPart } from '../data-stream/data-stream-parts';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { mergeObjects } from '../util/merge-objects';
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

export async function processChatResponse<MESSAGE_METADATA = any>({
  stream,
  update,
  onToolCall,
  onFinish,
  lastMessage,
  generateId = generateIdFunction,
  messageMetadataSchema,
}: {
  stream: AsyncIterableStream<DataStreamPart>;
  update: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: { message: UIMessage<MESSAGE_METADATA> }) => void;
  generateId?: () => string;
  lastMessage: UIMessage<MESSAGE_METADATA> | undefined;
  messageMetadataSchema?: Schema<MESSAGE_METADATA>;
}) {
  const replaceLastMessage = lastMessage?.role === 'assistant';

  let step = replaceLastMessage
    ? 1 + (extractMaxToolInvocationStep(getToolInvocations(lastMessage)) ?? 0)
    : 0;

  const message: UIMessage<MESSAGE_METADATA> = replaceLastMessage
    ? structuredClone(lastMessage)
    : {
        id: generateId(),
        metadata: {} as MESSAGE_METADATA,
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

    update({ message: copiedMessage });
  }

  async function updateMessageMetadata(metadata: unknown) {
    if (metadata != null) {
      const mergedMetadata =
        message.metadata != null
          ? mergeObjects(message.metadata, metadata)
          : metadata;

      if (messageMetadataSchema != null) {
        await validateTypes({
          value: mergedMetadata,
          schema: messageMetadataSchema,
        });
      }

      message.metadata = mergedMetadata as MESSAGE_METADATA;
    }
  }

  for await (const { type, value } of stream) {
    switch (type) {
      case 'text': {
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
        break;
      }

      case 'reasoning': {
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
        break;
      }

      case 'reasoning-part-finish': {
        if (currentReasoningPart != null) {
          currentReasoningPart = undefined;
        }
        break;
      }

      case 'file': {
        message.parts.push({
          type: 'file',
          mediaType: value.mediaType,
          url: value.url,
        });

        execUpdate();
        break;
      }

      case 'source': {
        message.parts.push({
          type: 'source',
          source: value,
        });

        execUpdate();
        break;
      }

      case 'tool-call-streaming-start': {
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
        break;
      }

      case 'tool-call-delta': {
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
        break;
      }

      case 'tool-call': {
        // workaround for Zod issue where unknown includes undefined
        const call = { args: value.args!, ...value };

        updateToolInvocationPart(value.toolCallId, {
          state: 'call',
          step,
          ...call,
        } as const);

        execUpdate();

        // invoke the onToolCall callback if it exists. This is blocking.
        // In the future we should make this non-blocking, which
        // requires additional state management for error handling etc.
        if (onToolCall) {
          const result = await onToolCall({
            toolCall: call,
          });
          if (result != null) {
            updateToolInvocationPart(value.toolCallId, {
              state: 'result',
              step,
              ...call,
              result,
            } as const);

            execUpdate();
          }
        }
        break;
      }

      case 'tool-result': {
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

        // workaround for Zod issue where unknown includes undefined
        const result = { result: value.result!, ...value };

        updateToolInvocationPart(value.toolCallId, {
          ...toolInvocations[toolInvocationIndex],
          state: 'result' as const,
          ...result,
        } as const);

        execUpdate();
        break;
      }

      case 'start-step': {
        // add a step boundary part to the message
        message.parts.push({ type: 'step-start' });

        await updateMessageMetadata(value.metadata);
        execUpdate();
        break;
      }

      case 'finish-step': {
        step += 1;

        // reset the current text and reasoning parts
        currentTextPart = undefined;
        currentReasoningPart = undefined;

        await updateMessageMetadata(value.metadata);
        if (value.metadata != null) {
          execUpdate();
        }
        break;
      }

      case 'start': {
        if (value.messageId != null) {
          message.id = value.messageId;
        }

        await updateMessageMetadata(value.metadata);

        if (value.messageId != null || value.metadata != null) {
          execUpdate();
        }
        break;
      }

      case 'finish': {
        await updateMessageMetadata(value.metadata);
        if (value.metadata != null) {
          execUpdate();
        }
        break;
      }

      case 'message-metadata': {
        await updateMessageMetadata(value.metadata);
        if (value.metadata != null) {
          execUpdate();
        }
        break;
      }

      case 'error': {
        throw new Error(value);
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unhandled stream part: ${_exhaustiveCheck}`);
      }
    }
  }

  onFinish?.({ message });
}
