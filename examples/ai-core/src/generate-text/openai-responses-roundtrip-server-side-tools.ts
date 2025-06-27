import { createOpenAI } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

const openai = createOpenAI({
  // Console log the API request body for debugging
  fetch: async (url, options) => {
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

async function main() {
  const { content } = await generateText({
    model: openai.responses('gpt-4o-mini'),
    tools: {
      web_search_preview: openai.tools.webSearchPreview({}),
      checkStatus: tool({
        description: 'Check implementation status',
        inputSchema: z.object({
          component: z.string(),
        }),
        execute: async ({ component }) => {
          console.log(`Executing client tool: ${component}`);
          return { status: 'working', component };
        },
      }),
    },
    prompt:
      'Search for San Francisco tech news, then check server-side tool status.',
  });

  console.log('\n=== Results ===');
  for (const part of content) {
    if (part.type === 'tool-call') {
      console.log(
        `Tool Call: ${part.toolName} (providerExecuted: ${part.providerExecuted})`,
      );
    } else if (part.type === 'tool-result') {
      console.log(
        `Tool Result: ${part.toolName} (providerExecuted: ${part.providerExecuted})`,
      );
    } else if (part.type === 'text') {
      console.log(`Text: ${part.text.substring(0, 80)}...`);
    }
  }
}

main().catch(console.error);
