import { jsonSchema, tool, type Tool } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

const toolSearchSymbol = Symbol.for('vercel.ai.toolSearch');
const toolSearchMaxResultsSymbol = Symbol.for(
  'vercel.ai.toolSearch.maxResults',
);

type ToolSearchInput = { query: string };
type ToolSearchOutput = {
  tools: Array<{ name: string; description?: string }>;
};

/**
 * Search deferred tools by name and description. The surrounding generation
 * binds the search registry and makes matches available on the next step.
 * Use directly or through code mode with `toolDiscovery: 'conversation'`.
 */
export function toolSearch({
  maxResults = 5,
}: {
  /**
   * Maximum number of matching tools returned per search.
   *
   * @default 5
   */
  maxResults?: number;
} = {}): Tool<ToolSearchInput, ToolSearchOutput> & {
  type: 'function';
} {
  if (!Number.isSafeInteger(maxResults) || maxResults < 1) {
    throw new InvalidArgumentError({
      parameter: 'maxResults',
      value: maxResults,
      message: 'maxResults must be a positive safe integer.',
    });
  }

  return Object.assign(
    tool({
      description: `Search for tools by keywords in their names and descriptions. Returns up to ${maxResults === 5 ? 'five' : maxResults} matching tools. Matches become available on the next model step, after this execution finishes. Wait for their tool definitions before calling the discovered tools. If no tools match, try different keywords.`,
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
      [toolSearchMaxResultsSymbol]: maxResults,
    },
  );
}

export function getToolSearchMaxResults(tool: Tool): number {
  return (
    (tool as Tool & { [toolSearchMaxResultsSymbol]?: number })[
      toolSearchMaxResultsSymbol
    ] ?? 5
  );
}

export function isToolSearch(tool: Tool): boolean {
  return (
    (tool as Tool & { [toolSearchSymbol]?: boolean })[toolSearchSymbol] === true
  );
}
