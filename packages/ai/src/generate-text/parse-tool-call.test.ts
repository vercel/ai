import { dynamicTool, tool } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { ToolCallRepairError } from '../error/tool-call-repair-error';
import { parseToolCall } from './parse-tool-call';

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
    const result = await parseToolCall({
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
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": true,
        "error": [AI_NoSuchToolError: Model tried to call unavailable tool 'testTool'. No tools are available.],
        "input": "{}",
        "invalid": true,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('should throw NoSuchToolError when tool is not found', async () => {
    const result = await parseToolCall({
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
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": true,
        "error": [AI_NoSuchToolError: Model tried to call unavailable tool 'nonExistentTool'. Available tools: testTool.],
        "input": "{}",
        "invalid": true,
        "toolCallId": "123",
        "toolName": "nonExistentTool",
        "type": "tool-call",
      }
    `);
  });

  it('should throw InvalidToolArgumentsError when args are invalid', async () => {
    const result = await parseToolCall({
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
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": true,
        "error": [AI_InvalidToolInputError: Invalid input for tool testTool: Type validation failed: Value: {"param1":"test"}.
      Error message: [
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "param2"
          ],
          "message": "Invalid input: expected number, received undefined"
        }
      ]],
        "input": "{"param1": "test"}",
        "invalid": true,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
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

      const result = await parseToolCall({
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

      expect(result).toMatchInlineSnapshot(`
        {
          "dynamic": true,
          "error": [AI_InvalidToolInputError: Invalid input for tool testTool: JSON parsing failed: Text: invalid json.
        Error message: Unexpected token 'i', "invalid json" is not valid JSON],
          "input": "invalid json",
          "invalid": true,
          "toolCallId": "123",
          "toolName": "testTool",
          "type": "tool-call",
        }
      `);
    });

    it('should throw ToolCallRepairError if repairToolCall throws', async () => {
      const repairToolCall = vi.fn().mockRejectedValue(new Error('test error'));

      const result = await parseToolCall({
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

      expect(result).toMatchInlineSnapshot(`
        {
          "dynamic": true,
          "error": [AI_ToolCallRepairError: Error repairing tool call: test error],
          "input": "invalid json",
          "invalid": true,
          "toolCallId": "123",
          "toolName": "testTool",
          "type": "tool-call",
        }
      `);
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
