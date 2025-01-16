import 'dotenv/config';
import { venice as provider } from '@ai-sdk/venice';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: provider.chat('llama-3.3-70b', {
      venice_parameters: {
        include_venice_system_prompt: true
      }
    }),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error); 