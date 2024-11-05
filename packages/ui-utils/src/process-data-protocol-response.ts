import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { parsePartialJson } from './parse-partial-json';
import { readDataStream } from './read-data-stream';
import type { JSONValue, Message, UseChatOptions } from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

type PrefixMap = {
  text?: Message;
};

function assignAnnotationsToMessage<T extends Message | null | undefined>(
  message: T,
  annotations: JSONValue[] | undefined,
): T {
  if (!message || !annotations || !annotations.length) return message;
  return { ...message, annotations: [...annotations] } as T;
}

export async function processDataProtocolResponse({
  reader,
  abortControllerRef,
  update,
  onToolCall,
  onFinish,
  generateId = generateIdFunction,
  getCurrentDate = () => new Date(),
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  abortControllerRef?: {
    current: AbortController | null;
  };
  update: (newMessages: Message[], data: JSONValue[] | undefined) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    message: Message | undefined;
    finishReason: LanguageModelV1FinishReason;
    usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    };
  }) => void;
  generateId?: () => string;
  getCurrentDate?: () => Date;
}) {
  const createdAt = getCurrentDate();

  let prefixMap: PrefixMap = {};
  let nextPrefixMap: PrefixMap | undefined = undefined;

  const previousMessages: Message[] = [];

  const data: JSONValue[] = [];

  // keep list of current message annotations for message
  let messageAnnotations: JSONValue[] | undefined = undefined;

  // keep track of partial tool calls
  const partialToolCalls: Record<
    string,
    { text: string; prefixMapIndex: number; toolName: string }
  > = {};

  let usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  } = {
    completionTokens: NaN,
    promptTokens: NaN,
    totalTokens: NaN,
  };
  let finishReason: LanguageModelV1FinishReason = 'unknown';

  // we create a map of each prefix, and for each prefixed message we push to the map
  for await (const { type, value } of readDataStream(reader, {
    isAborted: () => abortControllerRef?.current === null,
  })) {
    if (type === 'error') {
      throw new Error(value);
    }

    if (type === 'finish_step') {
      if (!value.isContinued) {
        nextPrefixMap = {};
      }
      continue;
    }

    if (type === 'finish_message') {
      finishReason = value.finishReason;

      if (value.usage != null) {
        const { completionTokens, promptTokens } = value.usage;

        usage = {
          completionTokens,
          promptTokens,
          totalTokens: completionTokens + promptTokens,
        };
      }

      continue;
    }

    // switch to the next prefix map once we start receiving
    // content of the next message. Stream data annotations
    // are associated with the previous message until then to
    // support sending them in onFinish and onStepFinish:
    if (
      nextPrefixMap != null &&
      (type === 'text' ||
        type === 'tool_call' ||
        type === 'tool_call_streaming_start' ||
        type === 'tool_call_delta' ||
        type === 'tool_result')
    ) {
      if (prefixMap.text) {
        previousMessages.push(prefixMap.text);
      }

      prefixMap = nextPrefixMap;
      nextPrefixMap = undefined;
    }

    if (type === 'text') {
      if (prefixMap['text']) {
        prefixMap['text'] = {
          ...prefixMap['text'],
          content: (prefixMap['text'].content || '') + value,
        };
      } else {
        prefixMap['text'] = {
          id: generateId(),
          role: 'assistant',
          content: value,
          createdAt,
        };
      }
    }

    // Tool invocations are part of an assistant message
    if (type === 'tool_call_streaming_start') {
      // create message if it doesn't exist
      if (prefixMap.text == null) {
        prefixMap.text = {
          id: generateId(),
          role: 'assistant',
          content: '',
          createdAt,
        };
      }

      if (prefixMap.text.toolInvocations == null) {
        prefixMap.text.toolInvocations = [];
      }

      // add the partial tool call to the map
      partialToolCalls[value.toolCallId] = {
        text: '',
        toolName: value.toolName,
        prefixMapIndex: prefixMap.text.toolInvocations.length,
      };

      prefixMap.text.toolInvocations.push({
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        args: undefined,
      });
    } else if (type === 'tool_call_delta') {
      const partialToolCall = partialToolCalls[value.toolCallId];

      partialToolCall.text += value.argsTextDelta;

      const { value: partialArgs } = parsePartialJson(partialToolCall.text);

      prefixMap.text!.toolInvocations![partialToolCall.prefixMapIndex] = {
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: partialArgs,
      };

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      (prefixMap.text! as any).internalUpdateId = generateId();
    } else if (type === 'tool_call') {
      if (partialToolCalls[value.toolCallId] != null) {
        // change the partial tool call to a full tool call
        prefixMap.text!.toolInvocations![
          partialToolCalls[value.toolCallId].prefixMapIndex
        ] = { state: 'call', ...value };
      } else {
        // create message if it doesn't exist
        if (prefixMap.text == null) {
          prefixMap.text = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt,
          };
        }

        if (prefixMap.text.toolInvocations == null) {
          prefixMap.text.toolInvocations = [];
        }

        prefixMap.text.toolInvocations.push({
          state: 'call',
          ...value,
        });
      }

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      (prefixMap.text! as any).internalUpdateId = generateId();

      // invoke the onToolCall callback if it exists. This is blocking.
      // In the future we should make this non-blocking, which
      // requires additional state management for error handling etc.
      if (onToolCall) {
        const result = await onToolCall({ toolCall: value });
        if (result != null) {
          // store the result in the tool invocation
          prefixMap.text!.toolInvocations![
            prefixMap.text!.toolInvocations!.length - 1
          ] = { state: 'result', ...value, result };
        }
      }
    } else if (type === 'tool_result') {
      const toolInvocations = prefixMap.text?.toolInvocations;

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

      toolInvocations[toolInvocationIndex] = {
        ...toolInvocations[toolInvocationIndex],
        state: 'result' as const,
        ...value,
      };
    }

    if (type === 'data') {
      data.push(...value);
    }

    let responseMessage = prefixMap['text'];

    if (type === 'message_annotations') {
      if (!messageAnnotations) {
        messageAnnotations = [...value];
      } else {
        messageAnnotations.push(...value);
      }

      // Update any existing message with the latest annotations
      responseMessage = assignAnnotationsToMessage(
        prefixMap['text'],
        messageAnnotations,
      );

      // trigger update for streaming by copying adding a update id that changes
      // (without it, the changes get stuck in SWR and are not forwarded to rendering):
      if (prefixMap.text != null) {
        (prefixMap.text! as any).internalUpdateId = generateId();
      }
    }

    // keeps the prefixMap up to date with the latest annotations, even if annotations preceded the message
    if (messageAnnotations?.length) {
      if (prefixMap.text) {
        prefixMap.text.annotations = [...messageAnnotations!];
      }
    }

    // We add response messages to the messages[], but data is its own thing
    const merged = [responseMessage].filter(Boolean).map(message => ({
      ...assignAnnotationsToMessage(message, messageAnnotations),
    })) as Message[];

    update([...previousMessages, ...merged], [...data]); // make a copy of the data array
  }

  onFinish?.({ message: prefixMap.text, finishReason, usage });

  return {
    messages: [prefixMap.text].filter(Boolean) as Message[],
    data,
  };
}
