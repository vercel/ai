import { jsonSchema, tool, type Tool } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

const toolSearchSymbol = Symbol.for('vercel.ai.toolSearch');
const toolSearchFunctionSymbol = Symbol.for('vercel.ai.toolSearch.search');
const toolSearchMaxResultsSymbol = Symbol.for(
  'vercel.ai.toolSearch.maxResults',
);

type ToolSearchFunction = (options: {
  query: string;
  tools: Array<{ name: string; description?: string }>;
}) => string[] | PromiseLike<string[]>;

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
  search,
  maxResults = 5,
}: {
  /**
   * Search eligible deferred tools and return their names in ranked order.
   * Supports synchronous and asynchronous callbacks. Unknown names and
   * duplicates are ignored before applying the result limit.
   */
  search?: ToolSearchFunction;
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
      description: `${search == null ? 'Search for tools by keywords in their names and descriptions.' : 'Search for tools matching a query.'} Returns up to ${maxResults === 5 ? 'five' : maxResults} matching tools. Matches become available on the next model step, after this execution finishes. Wait for their tool definitions before calling the discovered tools. If no tools match, try different keywords.`,
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
      [toolSearchFunctionSymbol]: search,
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

export function getToolSearchFunction(
  tool: Tool,
): ToolSearchFunction | undefined {
  return (tool as Tool & { [toolSearchFunctionSymbol]?: ToolSearchFunction })[
    toolSearchFunctionSymbol
  ];
}

export function isToolSearch(tool: Tool): boolean {
  return (
    (tool as Tool & { [toolSearchSymbol]?: boolean })[toolSearchSymbol] === true
  );
}
