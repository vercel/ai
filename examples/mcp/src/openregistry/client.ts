import { openai } from '@ai-sdk/openai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generateText, isStepCount } from 'ai';
import 'dotenv/config';
import { createMCPClient, MCPClient } from '@ai-sdk/mcp';

// OpenRegistry — a free, hosted Streamable-HTTP MCP server that proxies 27
// national company registries (UK Companies House, Germany Handelsregister,
// France Sirene+RNE, Italy InfoCamere via EU BRIS, Spain BORME, Korea OPENDART,
// plus 21 more) directly to AI agents. Anonymous tier — no signup, no API key.
//
// Docs: https://openregistry.sophymarine.com/docs/integrations/vercel-ai-sdk
async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://openregistry.sophymarine.com/mcp'),
  );

  const mcpClient: MCPClient = await createMCPClient({ transport });

  try {
    const tools = await mcpClient.tools();
    console.log(`Discovered ${Object.keys(tools).length} tools from OpenRegistry.`);

    const { text: answer } = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      stopWhen: isStepCount(10),
      onStepFinish: async ({ toolResults }) => {
        if (toolResults?.length) {
          console.log(`STEP RESULTS:\n${JSON.stringify(toolResults, null, 2)}`);
        }
      },
      system:
        'You are a research assistant with live access to 27 national company registries. ' +
        'Always cite the registry your data came from.',
      prompt:
        "Find Tesco PLC on UK Companies House (jurisdiction code 'gb'), then list the " +
        'three most recent filings.',
    });

    console.log(`\nFINAL ANSWER:\n${answer}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.close();
  }
}

main();
