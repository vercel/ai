import { tool, type UserModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { buildCodeModeToolCatalogUpdate } from './tool-catalog-diff.js';
import type { CodeModeToolSet } from './types.js';

const callerName = 'code_mode';

function createTool(description: string, fields: Record<string, z.ZodType>) {
  return tool({
    description,
    inputSchema: z.object(fields),
    execute: async () => undefined,
  });
}

function messageText(
  message: UserModelMessage | undefined,
): string | undefined {
  return typeof message?.content === 'string' ? message.content : undefined;
}

describe('buildCodeModeToolCatalogUpdate', () => {
  it('starts with a complete catalog', () => {
    const message = buildCodeModeToolCatalogUpdate({
      tools: {
        lookup: createTool('Look up a record.', { id: z.string() }),
      },
      callerName,
      messages: [],
    });

    expect(messageText(message)).toContain(
      'This is the complete code mode capability catalog.',
    );
    expect(messageText(message)).toContain('lookup: (input: { id: string; })');
    expect(messageText(message)).not.toContain('<!--');
  });

  it('only includes added tools after the initial catalog', () => {
    const initialTools: CodeModeToolSet = {
      lookup: createTool('Look up a record.', { id: z.string() }),
    };
    const initialMessage = buildCodeModeToolCatalogUpdate({
      tools: initialTools,
      callerName,
      messages: [],
    })!;

    const updateMessage = buildCodeModeToolCatalogUpdate({
      tools: {
        ...initialTools,
        summarize: createTool('Summarize a record.', { text: z.string() }),
      },
      callerName,
      messages: [initialMessage],
    });

    expect(messageText(updateMessage)).toContain('Added or updated tools:');
    expect(messageText(updateMessage)).toContain(
      'summarize: (input: { text: string; })',
    );
    expect(messageText(updateMessage)).not.toContain('lookup: (input:');
  });

  it('includes changed definitions and removed tool names', () => {
    const initialMessage = buildCodeModeToolCatalogUpdate({
      tools: {
        lookup: createTool('Look up a record.', { id: z.string() }),
        summarize: createTool('Summarize a record.', { text: z.string() }),
      },
      callerName,
      messages: [],
    })!;

    const updateMessage = buildCodeModeToolCatalogUpdate({
      tools: {
        lookup: createTool('Look up a record by region.', {
          id: z.string(),
          region: z.string(),
        }),
      },
      callerName,
      messages: [initialMessage],
    });

    expect(messageText(updateMessage)).toContain(
      'lookup: (input: { id: string; region: string; })',
    );
    expect(messageText(updateMessage)).toContain(
      'Removed tools:\n- `summarize`',
    );
  });

  it('returns no message when the catalog is unchanged', () => {
    const tools: CodeModeToolSet = {
      lookup: createTool('Look up a record.', { id: z.string() }),
    };
    const initialMessage = buildCodeModeToolCatalogUpdate({
      tools,
      callerName,
      messages: [],
    })!;

    expect(
      buildCodeModeToolCatalogUpdate({
        tools,
        callerName,
        messages: [initialMessage],
      }),
    ).toBeUndefined();
  });

  it('keeps independent state for each caller', () => {
    const tools: CodeModeToolSet = {
      lookup: createTool('Look up a record.', { id: z.string() }),
    };
    const firstCallerMessage = buildCodeModeToolCatalogUpdate({
      tools,
      callerName: 'first',
      messages: [],
    })!;

    expect(
      buildCodeModeToolCatalogUpdate({
        tools,
        callerName: 'second',
        messages: [firstCallerMessage],
      }),
    ).toMatchObject({
      content: expect.stringContaining('lookup: (input: { id: string; })'),
    });
  });
});
