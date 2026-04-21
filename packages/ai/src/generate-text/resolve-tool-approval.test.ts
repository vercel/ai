import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { TypeValidationError } from '../error';
import { resolveToolApproval } from './resolve-tool-approval';

describe('resolveToolApproval', () => {
  const messages = [{ role: 'user', content: 'hello' }] as const;
  const createToolCall = () => ({
    type: 'tool-call' as const,
    toolCallId: 'call-1',
    toolName: 'weather' as const,
    input: { city: 'Berlin' },
    dynamic: false as const,
  });

  it('returns not-applicable when neither user-defined nor tool-defined approval is configured', async () => {
    const result = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolApproval: undefined,
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {},
    });

    expect(result).toBe('not-applicable');
  });

  it('returns a user-defined static approval value before checking tool-defined approval', async () => {
    const toolDefinedNeedsApproval = vi.fn(() => true);

    const result = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: toolDefinedNeedsApproval,
        }),
      },
      toolApproval: {
        weather: 'denied',
      },
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {},
    });

    expect(result).toBe('denied');
    expect(toolDefinedNeedsApproval).not.toHaveBeenCalled();
  });

  it('uses a user-defined approval callback before tool-defined approval', async () => {
    const toolDefinedNeedsApproval = vi.fn(() => true);
    const userDefinedNeedsApproval = vi.fn(() => 'approved' as const);

    const result = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          contextSchema: z.object({ apiKey: z.string() }),
          needsApproval: toolDefinedNeedsApproval,
        }),
      },
      toolApproval: {
        weather: userDefinedNeedsApproval,
      },
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {
        weather: { apiKey: 'secret' },
      },
    });

    expect(result).toBe('approved');
    expect(userDefinedNeedsApproval).toHaveBeenCalledTimes(1);
    expect(userDefinedNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
        toolContext: { apiKey: 'secret' },
      },
    );
    expect(toolDefinedNeedsApproval).not.toHaveBeenCalled();
  });

  it('passes tool input and options to a user-defined approval callback without a context schema', async () => {
    const userDefinedNeedsApproval = vi.fn(() => 'user-approval' as const);

    await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
        }),
      },
      toolApproval: {
        weather: userDefinedNeedsApproval,
      },
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {},
    });

    expect(userDefinedNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
        toolContext: undefined,
      },
    );
  });

  it('maps tool-defined boolean approval to the public approval state', async () => {
    const approvedToolResult = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: true,
        }),
      },
      toolApproval: undefined,
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {},
    });

    const notApplicableToolResult = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          needsApproval: false,
        }),
      },
      toolApproval: undefined,
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {},
    });

    expect(approvedToolResult).toBe('user-approval');
    expect(notApplicableToolResult).toBe('not-applicable');
  });

  it('passes tool input and validated context to a tool-defined approval callback', async () => {
    const toolDefinedNeedsApproval = vi.fn(() => true);

    const result = await resolveToolApproval({
      tools: {
        weather: tool({
          inputSchema: z.object({ city: z.string() }),
          contextSchema: z.object({ apiKey: z.string() }),
          needsApproval: toolDefinedNeedsApproval,
        }),
      },
      toolApproval: undefined,
      toolCall: createToolCall(),
      messages: [...messages],
      toolsContext: {
        weather: { apiKey: 'secret' },
      },
    });

    expect(result).toBe('user-approval');
    expect(toolDefinedNeedsApproval).toHaveBeenCalledWith(
      { city: 'Berlin' },
      {
        toolCallId: 'call-1',
        messages: [...messages],
        context: { apiKey: 'secret' },
      },
    );
  });

  it('throws TypeValidationError before invoking a user-defined approval callback', async () => {
    const userDefinedNeedsApproval = vi.fn(() => 'user-approval' as const);

    try {
      await resolveToolApproval({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            contextSchema: z.object({ apiKey: z.string() }),
            needsApproval: vi.fn(() => true),
          }),
        },
        toolApproval: {
          weather: userDefinedNeedsApproval,
        },
        toolCall: createToolCall(),
        messages: [...messages],
        toolsContext: {
          weather: { apiKey: 123 } as any,
        },
      });

      expect.unreachable('expected resolveToolApproval to throw');
    } catch (error) {
      expect(userDefinedNeedsApproval).not.toHaveBeenCalled();

      expect(TypeValidationError.isInstance(error)).toBe(true);

      if (TypeValidationError.isInstance(error)) {
        expect(error.value).toEqual({ apiKey: 123 });
        expect(error.context).toEqual({
          field: 'tool context',
          entityName: 'weather',
        });
      }
    }
  });

  it('throws TypeValidationError before invoking a tool-defined approval callback', async () => {
    const toolDefinedNeedsApproval = vi.fn(() => true);

    try {
      await resolveToolApproval({
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            contextSchema: z.object({ apiKey: z.string() }),
            needsApproval: toolDefinedNeedsApproval,
          }),
        },
        toolApproval: undefined,
        toolCall: createToolCall(),
        messages: [...messages],
        toolsContext: {
          weather: { apiKey: 123 } as any,
        },
      });

      expect.unreachable('expected resolveToolApproval to throw');
    } catch (error) {
      expect(toolDefinedNeedsApproval).not.toHaveBeenCalled();

      expect(TypeValidationError.isInstance(error)).toBe(true);

      if (TypeValidationError.isInstance(error)) {
        expect(error.value).toEqual({ apiKey: 123 });
        expect(error.context).toEqual({
          field: 'tool context',
          entityName: 'weather',
        });
      }
    }
  });
});
