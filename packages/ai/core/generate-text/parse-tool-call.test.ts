import { z } from 'zod';
import { InvalidToolInputError } from '../../src/error/invalid-tool-input-error';
import { NoSuchToolError } from '../../src/error/no-such-tool-error';
import { tool } from '../tool';
import { parseToolCall } from './parse-tool-call';
import { ToolCallRepairError } from '../../src/error/tool-call-repair-error';

describe('parseToolCall', () => {
  it('should successfully parse a valid tool call', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{"param1": "test", "param2": 42}',
      },
      tools: {
        testTool: tool({
          inputSchema: z.object({
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
      input: { param1: 'test', param2: 42 },
    });
  });

  it('should successfully process empty calls for tools that have no inputSchema', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        input: '',
      },
      tools: {
        testTool: tool({
          inputSchema: z.object({}),
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
      input: {},
    });
  });

  it('should throw NoSuchToolError when tools is null', async () => {
    await expect(
      parseToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallType: 'function',
          toolName: 'testTool',
          toolCallId: '123',
          input: '{}',
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
          type: 'tool-call',
          toolCallType: 'function',
          toolName: 'nonExistentTool',
          toolCallId: '123',
          input: '{}',
        },
        tools: {
          testTool: tool({
            inputSchema: z.object({
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
          type: 'tool-call',
          toolCallType: 'function',
          toolName: 'testTool',
          toolCallId: '123',
          input: '{"param1": "test"}', // Missing required param2
        },
        tools: {
          testTool: tool({
            inputSchema: z.object({
              param1: z.string(),
              param2: z.number(),
            }),
          }),
        } as const,
        repairToolCall: undefined,
        messages: [],
        system: undefined,
      }),
    ).rejects.toThrow(InvalidToolInputError);
  });

  describe('tool call repair', () => {
    it('should invoke repairTool when provided and use its result', async () => {
      const repairToolCall = vi.fn().mockResolvedValue({
        toolCallType: 'function',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{"param1": "test", "param2": 42}',
      });

      const result = await parseToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallType: 'function',
          toolName: 'testTool',
          toolCallId: '123',
          input: 'invalid json', // This will trigger repair
        },
        tools: {
          testTool: tool({
            inputSchema: z.object({
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
          input: 'invalid json',
        }),
        tools: expect.any(Object),
        inputSchema: expect.any(Function),
        messages: [{ role: 'user', content: 'test message' }],
        system: 'test system',
        error: expect.any(InvalidToolInputError),
      });

      // Verify the repaired result was used
      expect(result).toEqual({
        type: 'tool-call',
        toolCallId: '123',
        toolName: 'testTool',
        input: { param1: 'test', param2: 42 },
      });
    });

    it('should re-throw error if tool call repair returns null', async () => {
      const repairToolCall = vi.fn().mockResolvedValue(null);

      await expect(
        parseToolCall({
          toolCall: {
            type: 'tool-call',
            toolCallType: 'function',
            toolName: 'testTool',
            toolCallId: '123',
            input: 'invalid json',
          },
          tools: {
            testTool: tool({
              inputSchema: z.object({
                param1: z.string(),
                param2: z.number(),
              }),
            }),
          } as const,
          repairToolCall,
          messages: [],
          system: undefined,
        }),
      ).rejects.toThrow(InvalidToolInputError);

      expect(repairToolCall).toHaveBeenCalledTimes(1);
    });

    it('should throw ToolCallRepairError if repairToolCall throws', async () => {
      const repairToolCall = vi.fn().mockRejectedValue(new Error('test error'));

      const resultPromise = parseToolCall({
        toolCall: {
          type: 'tool-call',
          toolCallType: 'function',
          toolName: 'testTool',
          toolCallId: '123',
          input: 'invalid json',
        },
        tools: {
          testTool: tool({
            inputSchema: z.object({
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
        originalError: expect.any(InvalidToolInputError),
      });
      expect(repairToolCall).toHaveBeenCalledTimes(1);
    });
  });
});
