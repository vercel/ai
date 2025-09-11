import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What happened in the world today?',
    providerOptions: {
      openai: { reasoningSummary: 'detailed', reasoningEffort: 'medium' },
    },
    tools: {
      web_search: openai.tools.webSearch(),
    },
  });

  console.log(JSON.stringify(result.response?.messages, null, 2));

  const result2 = await generateText({
    model: openai.responses('gpt-5-mini'),
    messages: [
      ...result.response?.messages,
      { role: 'user', content: 'Summarize in 2 sentences.' },
    ],
  });

  console.log(JSON.stringify(result2, null, 2));
}

main().catch(console.error);
