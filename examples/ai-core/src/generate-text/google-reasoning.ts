import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { reasoning, text } = await generateText({
    model: google('gemini-2.0-flash-thinking-exp'),
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  console.log('REASONING:\n');
  console.log(reasoning);
  console.log('\nTEXT:\n');
  console.log(text);
}

main().catch(console.error);
