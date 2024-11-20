import { openai } from '@ai-sdk/openai';
import {
  streamText,
  experimental_wrapLanguageModel as wrapLanguageModel,
} from 'ai';
import 'dotenv/config';
import { yourRagMiddleware } from './your-rag-middleware';

async function main() {
  const result = streamText({
    model: wrapLanguageModel({
      model: openai('gpt-4o'),
      middleware: yourRagMiddleware,
    }),
    prompt: 'What cities are in the United States?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
