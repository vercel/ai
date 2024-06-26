import { Message } from '@ai-sdk/ui-utils';
import {
  experimental_buildOpenAIMessages,
  ChatCompletionMessageParam,
} from './openai';

describe('experimental_buildOpenAIMessages', () => {
  it('should correctly map messages to ChatCompletionMessageParam', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'system',
        content: 'System message',
      },
      {
        id: '2',
        role: 'user',
        content: 'User message',
      },
      {
        id: '3',
        role: 'assistant',
        content: 'Assistant message',
        function_call: {
          name: 'functionName',
          arguments: 'arg1, arg2',
        },
      },
      {
        id: '4',
        role: 'function',
        content: 'Function message',
        name: 'functionName',
      },
      {
        id: '5',
        role: 'tool',
        content: 'Tool message',
        name: 'toolName',
        tool_call_id: 'toolCallId',
      },
    ];

    const expected: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'System message',
      },
      {
        role: 'user',
        content: 'User message',
      },
      {
        role: 'assistant',
        content: 'Assistant message',
        function_call: {
          name: 'functionName',
          arguments: 'arg1, arg2',
        },
      },
      {
        role: 'function',
        content: 'Function message',
        name: 'functionName',
      },
      {
        role: 'tool',
        content: 'Tool message',
        tool_call_id: 'toolCallId',
      },
    ];

    const result = experimental_buildOpenAIMessages(messages);

    expect(result).toEqual(expected);
  });

  it('should throw an error for invalid function call in assistant message', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'Assistant message',
        function_call: 'invalidFunctionCall',
      },
    ];

    expect(() => experimental_buildOpenAIMessages(messages)).toThrowError(
      'Invalid function call in message. Expected a function call object',
    );
  });

  it('should throw an error for invalid function call in function message', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'function',
        content: 'Function message',
      },
    ];

    expect(() => experimental_buildOpenAIMessages(messages)).toThrowError(
      'Invalid function call in message. Expected a name',
    );
  });

  it('should throw an error for unsupported message role', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'data',
        content: 'Data message',
      },
    ];

    expect(() => experimental_buildOpenAIMessages(messages)).toThrowError(
      "unsupported message role 'data'",
    );
  });

  it('should throw an error for invalid tool message', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'tool',
        content: 'Tool message',
        name: undefined,
      },
    ];

    expect(() => experimental_buildOpenAIMessages(messages)).toThrowError(
      'Invalid tool message. Expected a name',
    );
  });

  it('should throw an error for invalid tool message', () => {
    const messages: Message[] = [
      {
        id: '1',
        role: 'tool',
        content: 'Tool message',
        name: 'toolName',
        tool_call_id: undefined,
      },
    ];

    expect(() => experimental_buildOpenAIMessages(messages)).toThrowError(
      'Invalid tool message. Expected a tool_call_id',
    );
  });
});
