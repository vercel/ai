import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-6-astra'),
    prompt: 'Generate an image of a lighthouse on a rocky coast.',
    tools: {
      image_generation: openai.tools.imageGeneration({
        model: 'gpt-image-1-mini',
        quality: 'low',
        // stream preview images as preliminary tool results:
        partialImages: 2,
      }),
    },
  });

  for await (const part of result.stream) {
    if (part.type === 'tool-result' && !part.dynamic) {
      console.log(
        part.preliminary ? 'Preview image:' : 'Final image:',
        `${part.output.result.length} chars`,
      );
    }
  }

  const content = await result.content;
  console.log(
    'Tool results in content:',
    content.filter(part => part.type === 'tool-result').length,
  );
});
