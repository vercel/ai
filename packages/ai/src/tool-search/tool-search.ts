import { jsonSchema, tool, type Tool } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

const toolSearchSymbol = Symbol.for('vercel.ai.toolSearch');
const toolSearchMaxResultsSymbol = Symbol.for(
  'vercel.ai.toolSearch.maxResults',
);
const DEFAULT_MAX_RESULTS = 5;

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
  maxResults = DEFAULT_MAX_RESULTS,
}: {
  /**
   * Maximum number of matching tools to return and discover.
   *
   * @default 5
   */
  maxResults?: number;
} = {}): Tool<ToolSearchInput, ToolSearchOutput> & {
  type: 'function';
} {
  if (!Number.isInteger(maxResults)) {
    throw new InvalidArgumentError({
      parameter: 'maxResults',
      value: maxResults,
      message: 'maxResults must be an integer',
    });
  }

  if (maxResults < 0) {
    throw new InvalidArgumentError({
      parameter: 'maxResults',
      value: maxResults,
      message: 'maxResults must be greater than or equal to 0',
    });
  }

  return Object.assign(
    tool({
      description: `Search for tools by keywords in their names and descriptions. Returns up to ${maxResults} matching ${maxResults === 1 ? 'tool' : 'tools'}. Matches become available on the next model step, after this execution finishes. Wait for their tool definitions before calling the discovered tools. If no tools match, try different keywords.`,
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

export function isToolSearch(tool: Tool): boolean {
  return (
    (tool as Tool & { [toolSearchSymbol]?: boolean })[toolSearchSymbol] === true
  );
}

export function getToolSearchMaxResults(tool: Tool): number {
  return (
    (
      tool as Tool & {
        [toolSearchMaxResultsSymbol]?: number;
      }
    )[toolSearchMaxResultsSymbol] ?? DEFAULT_MAX_RESULTS
  );
}
