import { createMCPClient } from '@ai-sdk/mcp';

async function main() {
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: 'http://localhost:3001/mcp',
    },
  });

  try {
    console.log('serverInfo:', client.serverInfo);
    console.log('protocolVersion:', client.initializeResult.protocolVersion);

    const { tools } = await client.listTools();
    console.log(
      'tools:',
      tools.map(tool => tool.name),
    );

    const result = await client.callTool({
      name: 'greet',
      arguments: {
        name: 'Ada',
        region: 'us-east-1',
      },
    });
    console.log('result:', result);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
