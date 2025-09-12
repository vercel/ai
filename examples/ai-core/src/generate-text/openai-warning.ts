import { openai } from '@ai-sdk/openai';
import { generateText, Experimental_Warning } from 'ai';
import 'dotenv/config';

// globalThis.AI_SDK_LOG_WARNINGS = false;

// globalThis.AI_SDK_LOG_WARNINGS = (warnings: Experimental_Warning[]) => {
//   console.log('WARNINGS:', warnings);
// };

async function main() {
  const result = await generateText({
    model: openai('gpt-5-nano'),
    prompt: 'Invent a new holiday and describe its traditions.',
    seed: 123, // causes warning with gpt-5-nano
  });

  console.log(result.text);
}

main().catch(console.error);
