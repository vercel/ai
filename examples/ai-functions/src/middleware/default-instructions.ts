import { openai } from '@ai-sdk/openai';
import {
  defaultInstructionsMiddleware,
  generateText,
  wrapLanguageModel,
} from 'ai';
import { run } from '../lib/run';

run(async () => {
  const model = wrapLanguageModel({
    model: openai('gpt-4o-mini'),
    middleware: defaultInstructionsMiddleware({
      instructions: 'Answer in Spanish.',
    }),
  });

  const defaultResult = await generateText({
    model,
    prompt: 'Name the capital of France.',
  });

  const overriddenResult = await generateText({
    model,
    instructions: 'Answer in French.',
    prompt: 'Name the capital of France.',
  });

  console.log('Default instructions:', defaultResult.text);
  console.log('Call-level instructions:', overriddenResult.text);
});
