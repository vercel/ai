import { z } from 'zod';
import { InvalidToolArgumentsError } from '../../errors/invalid-tool-arguments-error';
import { NoSuchToolError } from '../../errors/no-such-tool-error';
import { tool } from '../tool';
import { parseToolCall } from './parse-tool-call';
import { ToolCallRepairError } from '../../errors/tool-call-repair-error';

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
    repairToolCall: undefined,
    messages: [],
    system: undefined,
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
    repairToolCall: undefined,
    messages: [],
    system: undefined,
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
      repairToolCall: undefined,
      messages: [],
      system: undefined,
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
      repairToolCall: undefined,
      messages: [],
      system: undefined,
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
      repairToolCall: undefined,
      messages: [],
      system: undefined,
    }),
  ).rejects.toThrow(InvalidToolArgumentsError);
});

describe('tool call repair', () => {
  it('should invoke repairTool when provided and use its result', async () => {
    const repairToolCall = vi.fn().mockResolvedValue({
      toolCallType: 'function',
      toolName: 'testTool',
      toolCallId: '123',
      args: '{"param1": "test", "param2": 42}',
    });

    const result = await parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        args: 'invalid json', // This will trigger repair
      },
      tools: {
        testTool: tool({
          parameters: z.object({
            param1: z.string(),
            param2: z.number(),
          }),
        }),
      } as const,
      repairToolCall,
      messages: [{ role: 'user', content: 'test message' }],
      system: 'test system',
    });

    // Verify repair function was called
    expect(repairToolCall).toHaveBeenCalledTimes(1);
    expect(repairToolCall).toHaveBeenCalledWith({
      toolCall: expect.objectContaining({
        toolName: 'testTool',
        args: 'invalid json',
      }),
      tools: expect.any(Object),
      parameterSchema: expect.any(Function),
      messages: [{ role: 'user', content: 'test message' }],
      system: 'test system',
      error: expect.any(InvalidToolArgumentsError),
    });

    // Verify the repaired result was used
    expect(result).toEqual({
      type: 'tool-call',
      toolCallId: '123',
      toolName: 'testTool',
      args: { param1: 'test', param2: 42 },
    });
  });

  it('should re-throw error if tool call repair returns null', async () => {
    const repairToolCall = vi.fn().mockResolvedValue(null);

    await expect(
      parseToolCall({
        toolCall: {
          toolCallType: 'function',
          toolName: 'testTool',
          toolCallId: '123',
          args: 'invalid json',
        },
        tools: {
          testTool: tool({
            parameters: z.object({
              param1: z.string(),
              param2: z.number(),
            }),
          }),
        } as const,
        repairToolCall,
        messages: [],
        system: undefined,
      }),
    ).rejects.toThrow(InvalidToolArgumentsError);

    expect(repairToolCall).toHaveBeenCalledTimes(1);
  });

  it('should throw ToolCallRepairError if repairToolCall throws', async () => {
    const repairToolCall = vi.fn().mockRejectedValue(new Error('test error'));

    const resultPromise = parseToolCall({
      toolCall: {
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        args: 'invalid json',
      },
      tools: {
        testTool: tool({
          parameters: z.object({
            param1: z.string(),
            param2: z.number(),
          }),
        }),
      } as const,
      repairToolCall,
      messages: [],
      system: undefined,
    });

    await expect(resultPromise).rejects.toThrow(ToolCallRepairError);
    await expect(resultPromise).rejects.toMatchObject({
      cause: new Error('test error'),
      originalError: expect.any(InvalidToolArgumentsError),
    });
    expect(repairToolCall).toHaveBeenCalledTimes(1);
  });
});
