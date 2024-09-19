import { LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { parseToolCall } from './parse-tool-call';
import { tool } from '../tool';
import { z } from 'zod';

const mockTools = {
  testTool: tool({
    parameters: z.object({
      param1: z.string(),
      param2: z.number(),
    }),
  }),
} as const;

it('should successfully parse a valid tool call', () => {
  const toolCall: LanguageModelV1FunctionToolCall = {
    toolCallType: 'function',
    toolName: 'testTool',
    toolCallId: '123',
    args: '{"param1": "test", "param2": 42}',
  };

  const result = parseToolCall({ toolCall, tools: mockTools });

  expect(result).toEqual({
    type: 'tool-call',
    toolCallId: '123',
    toolName: 'testTool',
    args: { param1: 'test', param2: 42 },
  });
});

it('should throw NoSuchToolError when tools is null', () => {
  const toolCall: LanguageModelV1FunctionToolCall = {
    toolCallType: 'function',
    toolName: 'testTool',
    toolCallId: '123',
    args: '{}',
  };

  expect(() => parseToolCall({ toolCall, tools: undefined })).toThrow(
    NoSuchToolError,
  );
});

it('should throw NoSuchToolError when tool is not found', () => {
  const toolCall: LanguageModelV1FunctionToolCall = {
    toolCallType: 'function',
    toolName: 'nonExistentTool',
    toolCallId: '123',
    args: '{}',
  };

  expect(() => parseToolCall({ toolCall, tools: mockTools })).toThrow(
    NoSuchToolError,
  );
});

it('should throw InvalidToolArgumentsError when args are invalid', () => {
  const toolCall: LanguageModelV1FunctionToolCall = {
    toolCallType: 'function',
    toolName: 'testTool',
    toolCallId: '123',
    args: '{"param1": "test"}', // Missing required param2
  };

  expect(() => parseToolCall({ toolCall, tools: mockTools })).toThrow(
    InvalidToolArgumentsError,
  );
});
