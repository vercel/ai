import { jsonSchema, tool, type Tool } from '@ai-sdk/provider-utils';

const toolSearchSymbol = Symbol.for('vercel.ai.toolSearch');
const toolSearchOptionsSymbol = Symbol.for('vercel.ai.toolSearchOptions');

type ToolSearchInput = { query: string };
type ToolSearchOutput = {
  tools: Array<{ name: string; description?: string }>;
};

export type ToolSearchOptions = {
  /**
   * Rank the eligible deferred tools for a model-provided query.
   *
   * Return tool names in ranked order. Names that are not in `tools` are
   * ignored, and at most five tools are returned and discovered.
   */
  search?: (
    query: string,
    tools: Array<{ name: string; description?: string }>,
  ) => string[] | PromiseLike<string[]>;
};

/**
 * Search deferred tools by name and description. The surrounding generation
 * binds the search registry and makes matches available on the next step.
 * Use directly or through code mode with `toolDiscovery: 'conversation'`.
 */
export function toolSearch(options: ToolSearchOptions = {}): Tool<
  ToolSearchInput,
  ToolSearchOutput
> & {
  type: 'function';
} {
  return Object.assign(
    tool({
      description:
        'Search for tools by keywords in their names and descriptions. Returns up to five matching tools. Matches become available on the next model step, after this execution finishes. Wait for their tool definitions before calling the discovered tools. If no tools match, try different keywords.',
      inputSchema: jsonSchema<ToolSearchInput>({
        type: 'object',
        properties: { query: { type: 'string', minLength: 1 } },
        required: ['query'],
        additionalProperties: false,
      }),
      outputSchema: jsonSchema<ToolSearchOutput>({
        type: 'object',
        properties: {
          tools: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
        },
        required: ['tools'],
        additionalProperties: false,
      }),
      execute: () => {
        throw new Error('toolSearch must be bound by an AI SDK generation.');
      },
    }),
    {
      type: 'function' as const,
      [toolSearchSymbol]: true,
      [toolSearchOptionsSymbol]: options,
    },
  );
}

export function isToolSearch(tool: Tool): boolean {
  return (
    (tool as Tool & { [toolSearchSymbol]?: boolean })[toolSearchSymbol] === true
  );
}

export function getToolSearchOptions(
  tool: Tool,
): ToolSearchOptions | undefined {
  return (tool as Tool & { [toolSearchOptionsSymbol]?: ToolSearchOptions })[
    toolSearchOptionsSymbol
  ];
}
