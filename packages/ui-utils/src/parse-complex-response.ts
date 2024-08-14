import { generateId as generateIdFunction } from '@ai-sdk/provider-utils';
import { parsePartialJson } from './parse-partial-json';
import { readDataStream } from './read-data-stream';
import type {
  FunctionCall,
  JSONValue,
  Message,
  ToolCall,
  UseChatOptions,
} from './types';
import { LanguageModelV1FinishReason } from '@ai-sdk/provider';

type PrefixMap = {
  text?: Message;
  // @deprecated
  function_call?: Message & {
    role: 'assistant';
    function_call: FunctionCall;
  };
  // @deprecated
  tool_calls?: Message & {
    role: 'assistant';
    tool_calls: ToolCall[];
  };
  data: JSONValue[];
};

function assignAnnotationsToMessage<T extends Message | null | undefined>(
  message: T,
  annotations: JSONValue[] | undefined,
): T {
  if (!message || !annotations || !annotations.length) return message;
  return { ...message, annotations: [...annotations] } as T;
}

export async function parseComplexResponse({
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
  update: (merged: Message[], data: JSONValue[] | undefined) => void;
  onToolCall?: UseChatOptions['onToolCall'];
  onFinish?: (options: {
    prefixMap: PrefixMap;
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
  const prefixMap: PrefixMap = {
    data: [],
  };

  // keep list of current message annotations for message
  let message_annotations: JSONValue[] | undefined = undefined;

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

    if (type === 'finish_message') {
      const { completionTokens, promptTokens } = value.usage;

      finishReason = value.finishReason;
      usage = {
        completionTokens,
        promptTokens,
        totalTokens: completionTokens + promptTokens,
      };
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

      prefixMap.text!.toolInvocations![partialToolCall.prefixMapIndex] = {
        state: 'partial-call',
        toolCallId: value.toolCallId,
        toolName: partialToolCall.toolName,
        args: parsePartialJson(partialToolCall.text),
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

    let functionCallMessage: Message | null | undefined = null;

    if (type === 'function_call') {
      prefixMap['function_call'] = {
        id: generateId(),
        role: 'assistant',
        content: '',
        function_call: value.function_call,
        name: value.function_call.name,
        createdAt,
      };

      functionCallMessage = prefixMap['function_call'];
    }

    let toolCallMessage: Message | null | undefined = null;

    if (type === 'tool_calls') {
      prefixMap['tool_calls'] = {
        id: generateId(),
        role: 'assistant',
        content: '',
        tool_calls: value.tool_calls,
        createdAt,
      };

      toolCallMessage = prefixMap['tool_calls'];
    }

    if (type === 'data') {
      prefixMap['data'].push(...value);
    }

    let responseMessage = prefixMap['text'];

    if (type === 'message_annotations') {
      if (!message_annotations) {
        message_annotations = [...value];
      } else {
        message_annotations.push(...value);
      }

      // Update any existing message with the latest annotations
      functionCallMessage = assignAnnotationsToMessage(
        prefixMap['function_call'],
        message_annotations,
      );
      toolCallMessage = assignAnnotationsToMessage(
        prefixMap['tool_calls'],
        message_annotations,
      );
      responseMessage = assignAnnotationsToMessage(
        prefixMap['text'],
        message_annotations,
      );
    }

    // keeps the prefixMap up to date with the latest annotations, even if annotations preceded the message
    if (message_annotations?.length) {
      const messagePrefixKeys: (keyof PrefixMap)[] = [
        'text',
        'function_call',
        'tool_calls',
      ];
      messagePrefixKeys.forEach(key => {
        if (prefixMap[key]) {
          (prefixMap[key] as Message).annotations = [...message_annotations!];
        }
      });
    }

    // We add function & tool calls and response messages to the messages[], but data is its own thing
    const merged = [functionCallMessage, toolCallMessage, responseMessage]
      .filter(Boolean)
      .map(message => ({
        ...assignAnnotationsToMessage(message, message_annotations),
      })) as Message[];

    update(merged, [...prefixMap['data']]); // make a copy of the data array
  }

  onFinish?.({ prefixMap, finishReason, usage });

  return {
    messages: [
      prefixMap.text,
      prefixMap.function_call,
      prefixMap.tool_calls,
    ].filter(Boolean) as Message[],
    data: prefixMap.data,
  };
}
