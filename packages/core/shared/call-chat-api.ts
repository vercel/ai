import { parseComplexResponse } from './parse-complex-response';
import {
  FunctionCall,
  IdGenerator,
  JSONValue,
  Message,
  ToolCall,
} from './types';
import { COMPLEX_HEADER, createChunkDecoder } from './utils';

export async function callChatApi({
  api,
  messages,
  body,
  credentials,
  headers,
  abortController,
  appendMessage,
  restoreMessagesOnFailure,
  onResponse,
  onUpdate,
  onFinish,
  generateId,
}: {
  api: string;
  messages: Omit<Message, 'id'>[];
  body: Record<string, any>;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  abortController?: () => AbortController | null;
  restoreMessagesOnFailure: () => void;
  appendMessage: (message: Message) => void;
  onResponse?: (response: Response) => void | Promise<void>;
  onUpdate: (merged: Message[], data: JSONValue[] | undefined) => void;
  onFinish?: (message: Message) => void;
  generateId: IdGenerator;
}) {
  const response = await fetch(api, {
    method: 'POST',
    body: JSON.stringify({
      messages,
      ...body,
    }),
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    signal: abortController?.()?.signal,
    credentials,
  }).catch(err => {
    restoreMessagesOnFailure();
    throw err;
  });

  if (onResponse) {
    try {
      await onResponse(response);
    } catch (err) {
      throw err;
    }
  }

  if (!response.ok) {
    restoreMessagesOnFailure();
    throw new Error(
      (await response.text()) || 'Failed to fetch the chat response.',
    );
  }

  if (!response.body) {
    throw new Error('The response body is empty.');
  }

  const reader = response.body.getReader();
  const isComplexMode = response.headers.get(COMPLEX_HEADER) === 'true';

  if (isComplexMode) {
    return await parseComplexResponse({
      reader,
      abortControllerRef:
        abortController != null ? { current: abortController() } : undefined,
      update: onUpdate,
      onFinish(prefixMap) {
        if (onFinish && prefixMap.text != null) {
          onFinish(prefixMap.text);
        }
      },
      generateId,
    });
  } else {
    const createdAt = new Date();
    const decode = createChunkDecoder(false);

    // TODO-STREAMDATA: Remove this once Stream Data is not experimental
    let streamedResponse = '';
    let currentLine = '';
    const replyId = generateId();
    let responseMessage: Message = {
      id: replyId,
      createdAt,
      content: '',
      role: 'assistant',
    };

    const functionCallStartId = '{"function_call":';
    const toolCallStartId = '{"tool_calls":';

    // TODO-STREAMDATA: Remove this once Stream Data is not experimental
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // Update the chat state with the new message tokens.
      streamedResponse += decode(value);


      if (streamedResponse.startsWith(functionCallStartId)) {
        // While the function call is streaming, it will be a string.
        responseMessage['function_call'] = streamedResponse;
      } else if (streamedResponse.startsWith(toolCallStartId)) {
        // While the tool calls are streaming, it will be a string.
        responseMessage['tool_calls'] = streamedResponse;
      } else {
        responseMessage['content'] = streamedResponse;
      }
      responseMessage['content'] = streamedResponse.split("\n").filter(line => !line.startsWith(functionCallStartId)&&!line.startsWith(toolCallStartId)).join("\n")
      appendMessage({ ...responseMessage });

      // The request has been aborted, stop reading the stream.
      if (abortController?.() === null) {
        reader.cancel();
        break;
      }
    }
    const lines = streamedResponse.split("\n")
    const functionCallLine = lines.find(line => line.startsWith(functionCallStartId))
    const toolCallLine = lines.find(line => line.startsWith(toolCallStartId))

    if (functionCallLine) {
      // Once the stream is complete, the function call is parsed into an object.
      const parsedFunctionCall: FunctionCall =
        JSON.parse(functionCallLine).function_call;

      responseMessage['function_call'] = parsedFunctionCall;

      appendMessage({ ...responseMessage });
    }
    if (toolCallLine) {
      // Once the stream is complete, the tool calls are parsed into an array.
      const parsedToolCalls: ToolCall[] =
        JSON.parse(toolCallLine).tool_calls;

      responseMessage['tool_calls'] = parsedToolCalls;

      appendMessage({ ...responseMessage });
    }

    if (onFinish) {
      onFinish(responseMessage);
    }

    return responseMessage;
  }
}
