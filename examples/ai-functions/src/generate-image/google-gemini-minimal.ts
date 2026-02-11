import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { files } = await generateText({
    model: google('gemini-2.5-flash-image'),
    prompt: 'A nano banana in a fancy restaurant',
  });

  console.log(`Generated ${files.length} image files`);
});
