import { openai } from '@ai-sdk/openai';
import { generateText, type Warning } from 'ai';
import { run } from '../lib/run';

// globalThis.AI_SDK_LOG_WARNINGS = false;

// globalThis.AI_SDK_LOG_WARNINGS = (warnings: Warning[]) => {
//   console.log('WARNINGS:', warnings);
// };

run(async () => {
  const result = await generateText({
    model: openai('gpt-5-nano'),
    prompt: 'Invent a new holiday and describe its traditions.',
    seed: 123, // causes warning with gpt-5-nano
  });

  console.log(result.text);
});
