import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateObject({
    model: google('gemini-1.5-pro-latest'),
    output: 'enum',
    enum: ['action', 'comedy', 'drama', 'horror', 'sci-fi'],
    prompt:
      'Classify the genre of this movie plot: ' +
      '"A group of astronauts travel through a wormhole in search of a ' +
      'new habitable planet for humanity."',
  });

  console.log(result.object);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
