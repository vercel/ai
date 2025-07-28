import { z } from 'zod/v4';
import { InvalidToolInputError } from '../../src/error/invalid-tool-input-error';
import { NoSuchToolError } from '../../src/error/no-such-tool-error';
import { tool } from '../tool';
import { parseToolCall } from './parse-tool-call';
import { ToolCallRepairError } from '../../src/error/tool-call-repair-error';
import { dynamicTool } from '../../../provider-utils/src/types/tool';

describe('parseToolCall', () => {
  it('should successfully parse a valid tool call', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
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

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": false,
        "input": {
          "param1": "test",
          "param2": 42,
        },
        "providerExecuted": undefined,
        "providerMetadata": undefined,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('should successfully parse a valid tool call with provider metadata', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{"param1": "test", "param2": 42}',
        providerMetadata: {
          testProvider: {
            signature: 'sig',
          },
        },
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

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": false,
        "input": {
          "param1": "test",
          "param2": 42,
        },
        "providerExecuted": undefined,
        "providerMetadata": {
          "testProvider": {
            "signature": "sig",
          },
        },
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('should successfully process empty tool calls for tools that have no inputSchema', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
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

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": false,
        "input": {},
        "providerExecuted": undefined,
        "providerMetadata": undefined,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('should successfully process empty object tool calls for tools that have no inputSchema', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{}',
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

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": false,
        "input": {},
        "providerExecuted": undefined,
        "providerMetadata": undefined,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('should throw NoSuchToolError when tools is null', async () => {
    await expect(
      parseToolCall({
        toolCall: {
          type: 'tool-call',
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
      expect(result).toMatchInlineSnapshot(`
        {
          "dynamic": false,
          "input": {
            "param1": "test",
            "param2": 42,
          },
          "providerExecuted": undefined,
          "providerMetadata": undefined,
          "toolCallId": "123",
          "toolName": "testTool",
          "type": "tool-call",
        }
      `);
    });

    it('should re-throw error if tool call repair returns null', async () => {
      const repairToolCall = vi.fn().mockResolvedValue(null);

      await expect(
        parseToolCall({
          toolCall: {
            type: 'tool-call',
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

  it('should set dynamic to true for dynamic tools', async () => {
    const result = await parseToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{"param1": "test", "param2": 42}',
      },
      tools: {
        testTool: dynamicTool({
          inputSchema: z.object({
            param1: z.string(),
            param2: z.number(),
          }),
          execute: async () => 'result',
        }),
      } as const,
      repairToolCall: undefined,
      messages: [],
      system: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": true,
        "input": {
          "param1": "test",
          "param2": 42,
        },
        "providerExecuted": undefined,
        "providerMetadata": undefined,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });
});
