import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What happened in the world today?',
    providerOptions: {
      openai: { reasoningSummary: 'detailed', reasoningEffort: 'medium' },
    },
    tools: {
      web_search: openai.tools.webSearch(),
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  const messages = (await result.response).messages;

  console.log(JSON.stringify(messages, null, 2));

  // switch to generate (output irrelevant)
  const result2 = await generateText({
    model: openai.responses('gpt-5-mini'),
    messages: [
      ...messages,
      { role: 'user', content: 'Summarize in 2 sentences.' },
    ],
  });

  console.log(JSON.stringify(result2, null, 2));
}

main().catch(console.error);
