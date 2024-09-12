import { openai } from '@ai-sdk/openai';
import {
  generateText,
  experimental_wrapLanguageModel as wrapLanguageModel,
} from 'ai';
import 'dotenv/config';
import { yourLogMiddleware } from './your-log-middleware';

async function main() {
  const result = await generateText({
    model: wrapLanguageModel({
      model: openai('gpt-4o'),
      middleware: yourLogMiddleware,
    }),
    prompt: 'What cities are in the United States?',
  });
}

main().catch(console.error);
