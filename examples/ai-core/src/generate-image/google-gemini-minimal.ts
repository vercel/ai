import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const { files } = await generateText({
    model: google('gemini-2.5-flash-image-preview'),
    prompt: 'A nano banana in a fancy restaurant',
  });

  console.log(`Generated ${files.length} image files`);
}

main().catch(console.error);
