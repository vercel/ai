import { cohere } from '@ai-sdk/cohere';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: cohere('command-a-reasoning-08-2025'),
    prompt:
      "Alice has 3 brothers and she also has 2 sisters. How many sisters does Alice's brother have?",
  });

  console.log('response');
  console.dir(result.response, { depth: null });
  console.log('content');
  console.dir(result.content, { depth: null });
}

main().catch(console.error);
