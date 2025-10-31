import { experimental_createMCPClient } from '@ai-sdk/mcp';

async function main() {
  const mcpClient = await experimental_createMCPClient({
    transport: {
      type: 'sse',
      url: 'http://localhost:8083/sse',
    },
  });

  try {
    const prompts = await mcpClient.listPrompts();
    console.log('PROMPTS:', JSON.stringify(prompts, null, 2));

    const prompt = await mcpClient.getPrompt({
      name: 'code_review',
      arguments: {
        code: "function add(a, b) { return a + b; }\n",
      },
    });
    console.log('GET PROMPT:', JSON.stringify(prompt, null, 2));
  } finally {
    await mcpClient.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


