import type {
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { hoistInlineToolChanges } from './hoist-inline-tool-changes';

const userMessage: LanguageModelV4Prompt[number] = {
  role: 'user',
  content: [{ type: 'text', text: 'Hello' }],
};

function functionTool(
  name: string,
  extra: Partial<LanguageModelV4FunctionTool> = {},
): LanguageModelV4FunctionTool {
  return {
    type: 'function',
    name,
    inputSchema: { type: 'object', properties: {} },
    ...extra,
  };
}

function toolChangeMessage(
  toolChanges: unknown[],
): LanguageModelV4Prompt[number] {
  return {
    role: 'system',
    content: '',
    providerOptions: { anthropic: { toolChanges: toolChanges as never } },
  };
}

describe('hoistInlineToolChanges', () => {
  it('returns the input unchanged without additions by value', () => {
    const prompt = [
      userMessage,
      toolChangeMessage([{ type: 'tool_addition', toolName: 'a' }]),
    ];
    const tools = [functionTool('a')];

    const result = hoistInlineToolChanges({ prompt, tools });

    expect(result.prompt).toBe(prompt);
    expect(result.tools).toBe(tools);
  });

  it('leaves additions by value on the initial system message alone', () => {
    const initial = toolChangeMessage([
      { type: 'tool_addition', tool: functionTool('a', { description: 'v2' }) },
    ]);
    const prompt = [initial, userMessage];
    const tools = [functionTool('a')];

    const result = hoistInlineToolChanges({ prompt, tools });

    expect(result.prompt).toBe(prompt);
    expect(result.tools).toBe(tools);
  });

  it('declares a new function tool as deferred without cache control', () => {
    const tool = functionTool('db_query', {
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
        other: { keep: true },
      },
    });

    const result = hoistInlineToolChanges({
      prompt: [
        userMessage,
        toolChangeMessage([{ type: 'tool_addition', tool }]),
      ],
      tools: undefined,
    });

    expect(result.tools).toEqual([
      {
        ...tool,
        providerOptions: {
          anthropic: { deferLoading: true },
          other: { keep: true },
        },
      },
    ]);
    expect(result.prompt[1].providerOptions?.anthropic?.toolChanges).toEqual([
      { type: 'tool_addition', toolName: 'db_query' },
    ]);
  });

  it('replaces a declared tool in place and keeps its deferral', () => {
    const declared = [
      functionTool('deferred', {
        providerOptions: { anthropic: { deferLoading: true } },
      }),
      functionTool('loaded'),
    ];
    const deferredV2 = functionTool('deferred', { description: 'v2' });
    const loadedV2 = functionTool('loaded', { description: 'v2' });

    const result = hoistInlineToolChanges({
      prompt: [
        userMessage,
        toolChangeMessage([
          { type: 'tool_addition', tool: deferredV2 },
          { type: 'tool_addition', tool: loadedV2 },
        ]),
      ],
      tools: declared,
    });

    expect(result.tools).toEqual([
      {
        ...deferredV2,
        providerOptions: { anthropic: { deferLoading: true } },
      },
      loadedV2,
    ]);
    expect(declared[1].description).toBeUndefined();
  });

  it('declares provider tools without deferral', () => {
    const webSearch = {
      type: 'provider' as const,
      id: 'anthropic.web_search_20250305' as const,
      name: 'web_search',
      args: { maxUses: 1 },
    };

    const result = hoistInlineToolChanges({
      prompt: [
        userMessage,
        toolChangeMessage([{ type: 'tool_addition', tool: webSearch }]),
      ],
      tools: [],
    });

    expect(result.tools).toEqual([webSearch]);
  });

  it('leaves computer tools, references and removals as they are', () => {
    const computer = {
      type: 'provider' as const,
      id: 'anthropic.computer_20251124' as const,
      name: 'computer',
      args: {},
    };
    const toolChanges = [
      { type: 'tool_addition', tool: computer },
      { type: 'tool_addition', toolName: 'a' },
      { type: 'tool_removal', toolName: 'b' },
      { type: 'tool_addition', tool: functionTool('c') },
    ];

    const result = hoistInlineToolChanges({
      prompt: [userMessage, toolChangeMessage(toolChanges)],
      tools: [],
    });

    expect(result.prompt[1].providerOptions?.anthropic?.toolChanges).toEqual([
      { type: 'tool_addition', tool: computer },
      { type: 'tool_addition', toolName: 'a' },
      { type: 'tool_removal', toolName: 'b' },
      { type: 'tool_addition', toolName: 'c' },
    ]);
    expect(result.tools?.map(tool => tool.name)).toEqual(['c']);
  });
});
