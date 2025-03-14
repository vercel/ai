import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const MOCK_API_RESPONSE = {
    name: "Animal Series Ver. 1",
    items: [
        "Rabbit",
        "Monkey",
        "Chicken",
        "Elephant",
        "Panda",
        "Koala",
        "Tiger",
        "Dalmatian",
        "Frog",
        "Sloth",
        "Owl",
        "Polar Bear"
    ]

};

const server = new McpServer({
  name: 'sonny-angel',
  version: '1.0.0',
});

server.tool(
  'get-sonny-angel-series',
  'Get Sonny Angel series by name',
  {
    name: z.string(),
  },
  async ({ name }) => {
    return {
        content: [
          {
            type: 'text',
            text: "The Sonny Angel Animal Series Ver. 1 includes the following items: " + MOCK_API_RESPONSE.items.join(", "),
          },
        ],
      };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sonny Angel MCP Server running on stdio');
}

main().catch(error => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
