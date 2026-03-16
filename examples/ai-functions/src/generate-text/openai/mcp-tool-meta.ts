import { createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Start examples/mcp/src/tool-meta/server.ts in another terminal first.
run(async () => {
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: 'http://localhost:8084/mcp',
    },
  });

  try {
    const tools = await client.tools();

    console.log('Tool metadata:');
    console.log(JSON.stringify(tools['get-weather']?._meta, null, 2));

    const result = await generateText({
      model: openai('gpt-5-mini'),
      tools,
      prompt: 'Use the get-weather tool to tell me the weather in Denver.',
    });

    console.log('\nTool calls:\n');
    console.dir(result.toolCalls, { depth: Infinity });

    console.log('\nText:\n');
    console.log(result.text);
  } finally {
    await client.close();
  }
});
