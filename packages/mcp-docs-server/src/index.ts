import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadContent, searchDocs, getDoc, listDocs } from './content';

const server = new Server(
  {
    name: 'ai-sdk-docs',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_ai_sdk_docs',
        description:
          'Search the AI SDK documentation by keyword or phrase. Returns matching documents with relevance scores and snippets. Use this first to find relevant docs before fetching full content.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query - can be a function name (streamText), concept (tool calling), or phrase (how to stream).',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default: 10, max: 20).',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_ai_sdk_doc',
        description:
          'Get the full content of a specific AI SDK documentation page. Use search_ai_sdk_docs first to find the right path. Large documents are paginated.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Document path from search results (e.g., "docs/03-ai-sdk-core/05-generating-text").',
            },
            page: {
              type: 'number',
              description:
                'Page number for large documents (default: 1). Check totalPages in response.',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_ai_sdk_docs',
        description:
          'List available AI SDK documentation pages. Use to browse the doc structure or find docs in a specific section.',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              description:
                'Filter by section: "docs" (guides/reference), "cookbook" (examples), "providers" (AI providers). Omit for all.',
              enum: ['docs', 'cookbook', 'providers'],
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'search_ai_sdk_docs': {
      const rawArgs = args as Record<string, unknown>;
      const query =
        typeof rawArgs.query === 'string'
          ? rawArgs.query
          : String(rawArgs.query ?? '');
      const limit = typeof rawArgs.limit === 'number' ? rawArgs.limit : 10;
      const results = searchDocs(query, Math.min(limit, 20));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                resultCount: results.length,
                results,
                hint:
                  results.length > 0
                    ? 'Use get_ai_sdk_doc with a path from these results to get full content.'
                    : 'Try different keywords or check list_ai_sdk_docs for available topics.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case 'get_ai_sdk_doc': {
      const rawArgs = args as Record<string, unknown>;
      const docPath = rawArgs.path;
      if (!docPath || typeof docPath !== 'string') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Missing required parameter: path',
                hint: 'Use search_ai_sdk_docs to find document paths.',
              }),
            },
          ],
          isError: true,
        };
      }
      const page =
        typeof rawArgs.page === 'number' ? Math.floor(rawArgs.page) : 1;
      const result = getDoc(docPath, page);
      if (!result) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Document not found: ${docPath}`,
                hint: 'Use search_ai_sdk_docs to find the correct path.',
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: result.content,
          },
        ],
      };
    }

    case 'list_ai_sdk_docs': {
      const rawArgs = args as Record<string, unknown>;
      const section =
        typeof rawArgs.section === 'string' ? rawArgs.section : undefined;
      const result = listDocs(section);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

async function main() {
  await loadContent();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AI SDK Docs MCP server running on stdio');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
