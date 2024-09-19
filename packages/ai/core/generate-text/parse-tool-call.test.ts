import { LanguageModelV1FunctionToolCall } from '@ai-sdk/provider';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { parseToolCall } from './parse-tool-call';
import { tool } from '../tool';
import { z } from 'zod';

it('should successfully parse a valid tool call', () => {
  const result = parseToolCall({
    toolCall: {
      toolCallType: 'function',
      toolName: 'testTool',
      toolCallId: '123',
      args: '{"param1": "test", "param2": 42}',
    },
    tools: {
      testTool: tool({
        parameters: z.object({
          param1: z.string(),
          param2: z.number(),
        }),
      }),
    } as const,
  });

  expect(result).toEqual({
    type: 'tool-call',
    toolCallId: '123',
    toolName: 'testTool',
    args: { param1: 'test', param2: 42 },
  });
});

it('should throw NoSuchToolError when tools is null', () => {
  expect(() =>
    parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        args: '{}',
      },
      tools: undefined,
    }),
  ).toThrow(NoSuchToolError);
});

it('should throw NoSuchToolError when tool is not found', () => {
  expect(() =>
    parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'nonExistentTool',
        toolCallId: '123',
        args: '{}',
      },
      tools: {
        testTool: tool({
          parameters: z.object({
            param1: z.string(),
            param2: z.number(),
          }),
        }),
      } as const,
    }),
  ).toThrow(NoSuchToolError);
});

it('should throw InvalidToolArgumentsError when args are invalid', () => {
  expect(() =>
    parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        args: '{"param1": "test"}', // Missing required param2
      },
      tools: {
        testTool: tool({
          parameters: z.object({
            param1: z.string(),
            param2: z.number(),
          }),
        }),
      } as const,
    }),
  ).toThrow(InvalidToolArgumentsError);
});
