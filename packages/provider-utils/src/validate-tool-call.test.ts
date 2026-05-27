import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { InvalidToolInputError } from './invalid-tool-input-error';
import { NoSuchToolError } from './no-such-tool-error';
import { dynamicTool, tool } from './types/tool';
import { validateToolCall } from './validate-tool-call';

describe('validateToolCall', () => {
  it('parses a valid static tool call', async () => {
    const result = await validateToolCall({
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
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "input": {
          "param1": "test",
          "param2": 42,
        },
        "providerExecuted": undefined,
        "providerMetadata": undefined,
        "title": undefined,
        "toolCallId": "123",
        "toolName": "testTool",
        "type": "tool-call",
      }
    `);
  });

  it('passes an empty object to the schema when input is empty', async () => {
    const result = await validateToolCall({
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
    });

    expect(result.input).toEqual({});
  });

  it('throws InvalidToolInputError on JSON parse failure', async () => {
    await expect(
      validateToolCall({
        toolCall: {
          type: 'tool-call',
          toolName: 'testTool',
          toolCallId: '123',
          input: 'not-json',
        },
        tools: {
          testTool: tool({ inputSchema: z.object({}) }),
        } as const,
      }),
    ).rejects.toSatisfy(InvalidToolInputError.isInstance);
  });

  it('throws InvalidToolInputError on schema validation failure', async () => {
    await expect(
      validateToolCall({
        toolCall: {
          type: 'tool-call',
          toolName: 'testTool',
          toolCallId: '123',
          input: '{"param1": 123}',
        },
        tools: {
          testTool: tool({
            inputSchema: z.object({ param1: z.string() }),
          }),
        } as const,
      }),
    ).rejects.toSatisfy(InvalidToolInputError.isInstance);
  });

  it('throws NoSuchToolError with availableTools when tools is provided', async () => {
    let caught: unknown;
    try {
      await validateToolCall({
        toolCall: {
          type: 'tool-call',
          toolName: 'missing',
          toolCallId: '123',
          input: '{}',
        },
        tools: {
          existing: tool({ inputSchema: z.object({}) }),
        } as const,
      });
    } catch (error) {
      caught = error;
    }

    expect(NoSuchToolError.isInstance(caught)).toBe(true);
    expect((caught as NoSuchToolError).toolName).toBe('missing');
    expect((caught as NoSuchToolError).availableTools).toEqual(['existing']);
  });

  it('throws NoSuchToolError without availableTools when tools is undefined', async () => {
    let caught: unknown;
    try {
      await validateToolCall({
        toolCall: {
          type: 'tool-call',
          toolName: 'missing',
          toolCallId: '123',
          input: '{}',
        },
        tools: undefined,
      });
    } catch (error) {
      caught = error;
    }

    expect(NoSuchToolError.isInstance(caught)).toBe(true);
    expect((caught as NoSuchToolError).availableTools).toBeUndefined();
  });

  it('returns a dynamic tool call for provider-executed dynamic tools without tools', async () => {
    const result = await validateToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'external',
        toolCallId: '123',
        input: '{"foo": "bar"}',
        providerExecuted: true,
        dynamic: true,
      },
      tools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "dynamic": true,
        "input": {
          "foo": "bar",
        },
        "providerExecuted": true,
        "providerMetadata": undefined,
        "toolCallId": "123",
        "toolName": "external",
        "type": "tool-call",
      }
    `);
  });

  it('returns a dynamic tool call for provider-executed dynamic tools not in the tool set', async () => {
    const result = await validateToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'external',
        toolCallId: '123',
        input: '',
        providerExecuted: true,
        dynamic: true,
      },
      tools: {
        other: tool({ inputSchema: z.object({}) }),
      } as const,
    });

    expect(result.dynamic).toBe(true);
    expect(result.input).toEqual({});
  });

  it('returns a dynamic shape when the tool itself is dynamic', async () => {
    const result = await validateToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'myDynamic',
        toolCallId: '123',
        input: '{"any": "thing"}',
      },
      tools: {
        myDynamic: dynamicTool({
          description: 'd',
          inputSchema: z.object({ any: z.string() }),
        }),
      } as const,
    });

    expect(result.dynamic).toBe(true);
    expect(result.input).toEqual({ any: 'thing' });
  });

  it('propagates providerMetadata and toolMetadata', async () => {
    const result = await validateToolCall({
      toolCall: {
        type: 'tool-call',
        toolName: 'testTool',
        toolCallId: '123',
        input: '{}',
        providerMetadata: { someProvider: { key: 'value' } },
      },
      tools: {
        testTool: tool({
          inputSchema: z.object({}),
          metadata: { kind: 'demo' },
        }),
      } as const,
    });

    expect(result.providerMetadata).toEqual({
      someProvider: { key: 'value' },
    });
    expect(result.toolMetadata).toEqual({ kind: 'demo' });
  });
});
