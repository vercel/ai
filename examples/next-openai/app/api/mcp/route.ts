import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText } from 'ai';

export async function POST() {
  let client;

  try {
    client = await experimental_createMCPClient({
      transport: {
        type: 'sse',
        url: 'http://localhost:8080/sse',
      },
    });

    const tools = await client.tools();

    const { text } = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      tools,
      maxSteps: 10,
      onStepFinish: async ({ toolResults }) => {
        console.log(`STEP RESULTS: ${JSON.stringify(toolResults, null, 2)}`);
      },
      system: 'You are a helpful chatbot',
      prompt: 'Can you find a product called The Product?',
    });

    return Response.json({ text });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Failed to generate text' });
  } finally {
    await client?.close();
  }
}
