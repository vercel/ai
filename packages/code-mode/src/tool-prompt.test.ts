import { jsonSchema, tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { experimental_createCodeModeTool as createCodeModeTool } from '../dist/index.js';

const BASE_RULES = `Execute code-mode TypeScript in an isolated sandbox.

Put the full program in \`js\`; top-level \`await\`/\`return\` work. Return a JSON-serializable result.
Call host tools only as async \`tools.name(input)\`; await each or use \`Promise.all\` for independent calls.
Use exact names/types below. \`JSON.parse\`/\`JSON.stringify\` are available.`;

const DISABLED_FETCH_PREFIX = `${BASE_RULES}
Fetch: \`fetch\` is not available.

Tools:`;

type CodeModeDescription = ReturnType<typeof createCodeModeTool>['description'];

function requireStaticDescription(description: CodeModeDescription): string {
  if (typeof description !== 'string') {
    throw new TypeError('Code mode must have a static tool description.');
  }
  return description;
}

function wordCount(description: CodeModeDescription): number {
  const value = requireStaticDescription(description);
  return value.trim().split(/\s+/).length;
}

describe('code mode prompt', () => {
  it('includes TypeScript signatures and examples for provided tools', () => {
    const codeMode = createCodeModeTool({
      search: tool({
        description: 'Search indexed documents.',
        inputSchema: z.object({
          query: z.string().describe('Search query'),
          limit: z.number().int().optional(),
          mode: z.enum(['web', 'files']),
        }),
        outputSchema: z.object({
          results: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              score: z.number(),
            }),
          ),
        }),
        inputExamples: [
          {
            input: {
              query: 'incident response notes',
              limit: 5,
              mode: 'files',
            },
          },
        ],
        execute: async () => ({}),
      }),
      summarize: tool({
        description: 'Summarize text.',
        inputSchema: z.object({
          text: z.string(),
          bullets: z.boolean().optional(),
        }),
        outputSchema: z.object({
          summary: z.string(),
          bullets: z.array(z.string()).optional(),
        }),
        execute: async () => ({}),
      }),
    });

    expect(codeMode.description).toBe(`${DISABLED_FETCH_PREFIX}
\`\`\`ts
declare const tools: {
  /** Search indexed documents. */
  search: (input: {
    /** Search query */
    query: string;
    limit?: number;
    mode: "web" | "files";
  }) => Promise<{ results: { id: string; title: string; score: number; }[]; }>;
  /** Summarize text. */
  summarize: (input: { text: string; bullets?: boolean; }) => Promise<{ summary: string; bullets?: string[]; }>;
};
\`\`\`

Tool call examples:
\`\`\`ts
const [search, summarize] = await Promise.all([
  tools.search({"query":"incident response notes","limit":5,"mode":"files"}),
  tools.summarize({"text":"string","bullets":true}),
]);
return {
  search: { results: search.results },
  summarize: { summary: summarize.summary },
};
\`\`\``);
    expect(wordCount(codeMode.description)).toBeLessThanOrEqual(140);
  });

  it('renders bracket access examples for tool names that are not valid identifiers', () => {
    const codeMode = createCodeModeTool({
      'web-search': tool({
        inputSchema: z.object({ q: z.string() }),
        outputSchema: z.object({ urls: z.array(z.string()) }),
        execute: async () => ({}),
      }),
    });

    expect(codeMode.description).toBe(`${DISABLED_FETCH_PREFIX}
\`\`\`ts
declare const tools: {
  "web-search": (input: { q: string; }) => Promise<{ urls: string[]; }>;
};
\`\`\`

Tool call examples:
\`\`\`ts
const result = await tools["web-search"]({"q":"string"});
return { urls: result.urls };
\`\`\``);
    expect(wordCount(codeMode.description)).toBeLessThanOrEqual(90);
  });

  it('renders nested JSON-schema shapes for non-Zod tools', () => {
    const codeMode = createCodeModeTool({
      report: tool({
        inputSchema: jsonSchema({
          type: 'object',
          required: ['items', 'metadata'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'string' },
                  score: { type: 'number' },
                },
              },
            },
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        }),
        outputSchema: jsonSchema({
          type: 'object',
          required: ['accepted', 'ids'],
          properties: {
            accepted: { type: 'boolean' },
            ids: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        }),
        execute: async () => ({}),
      }),
    });

    expect(codeMode.description).toBe(`${DISABLED_FETCH_PREFIX}
\`\`\`ts
declare const tools: {
  report: (input: { items: { id: string; score?: number; }[]; metadata: Record<string, string>; }) => Promise<{ accepted: boolean; ids: string[]; }>;
};
\`\`\`

Tool call examples:
\`\`\`ts
const result = await tools.report({"items":[{"id":"string","score":1}],"metadata":{}});
return { accepted: result.accepted };
\`\`\``);
    expect(wordCount(codeMode.description)).toBeLessThanOrEqual(100);
  });

  it('is explicit when no host tools are available', () => {
    const codeMode = createCodeModeTool({});

    expect(codeMode.description).toBe(
      `${DISABLED_FETCH_PREFIX}
No host tools. Do not call \`tools.*\`.`,
    );
    expect(wordCount(codeMode.description)).toBeLessThanOrEqual(65);
  });
});
