import { jsonSchema, tool, type Tool } from '@ai-sdk/provider-utils';

const toolSearchSymbol = Symbol.for('vercel.ai.toolSearch');

type ToolSearchInput = { query: string };
type ToolSearchOutput = {
  tools: Array<{ name: string; description?: string }>;
};

/**
 * Search deferred tools by name and description. The surrounding generation
 * binds the search registry and makes matches available on the next step.
 * Route this tool through code mode with `toolDiscovery: 'conversation'`.
 */
export function toolSearch(): Tool<ToolSearchInput, ToolSearchOutput> & {
  type: 'function';
} {
  return Object.assign(
    tool({
      description:
        'Search for tools by keywords in their names and descriptions. Returns up to five matching tools. Matches become available in the next code mode capability update, after this execution finishes. Return the search results and wait for that update before calling the discovered tools. If no tools match, try different keywords.',
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
        throw new Error(
          "toolSearch must be bound by the AI SDK generation through code mode with toolDiscovery: 'conversation'.",
        );
      },
    }),
    { type: 'function' as const, [toolSearchSymbol]: true },
  );
}

export function isToolSearch(tool: Tool): boolean {
  return (
    (tool as Tool & { [toolSearchSymbol]?: boolean })[toolSearchSymbol] === true
  );
}
