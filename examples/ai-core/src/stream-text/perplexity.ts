import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import 'dotenv/config';

const perplexity = createOpenAICompatible({
  name: 'perplexity',
  headers: {
    Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY ?? ''}`,
  },
  baseURL: 'https://api.perplexity.ai/',
});

async function main() {
  const result = streamText({
    model: perplexity('llama-3.1-sonar-small-128k-online'),
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
