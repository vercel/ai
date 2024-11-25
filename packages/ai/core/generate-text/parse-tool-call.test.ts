import { z } from 'zod';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { tool } from '../tool';
import { parseToolCall } from './parse-tool-call';

it('should successfully parse a valid tool call', async () => {
  const result = await parseToolCall({
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

it('should successfully process empty calls for tools that have no parameters', async () => {
  const result = await parseToolCall({
    toolCall: {
      toolCallType: 'function',
      toolName: 'testTool',
      toolCallId: '123',
      args: '',
    },
    tools: {
      testTool: tool({
        parameters: z.object({}),
      }),
    } as const,
  });

  expect(result).toEqual({
    type: 'tool-call',
    toolCallId: '123',
    toolName: 'testTool',
    args: {},
  });
});

it('should throw NoSuchToolError when tools is null', async () => {
  await expect(
    parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        args: '{}',
      },
      tools: undefined,
    }),
  ).rejects.toThrow(NoSuchToolError);
});

it('should throw NoSuchToolError when tool is not found', async () => {
  await expect(
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
  ).rejects.toThrow(NoSuchToolError);
});

it('should throw InvalidToolArgumentsError when args are invalid', async () => {
  await expect(
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
  ).rejects.toThrow(InvalidToolArgumentsError);
});
