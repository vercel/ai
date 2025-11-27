import { azure } from '@ai-sdk/azure';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { text, usage } = await generateText({
    model: azure('gpt-5.1-codex'), // use your own deployment
    temperature: 1,
    tools: {
      web_search: azure.tools.webSearchPreview({}),
    },
    providerOptions: {
      openai: {
        reasoningEffort: 'high',
        maxCompletionTokens: 32_000,
      },
    },
    messages: [
      {
        role: 'user',
        content:
          "Make a static website for today's stock news, use web search and make sure to use open_page",
      },
    ],
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
