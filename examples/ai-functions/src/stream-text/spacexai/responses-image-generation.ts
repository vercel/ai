import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { convertBase64ToUint8Array } from '../../lib/convert-base64';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: xai.responses('grok-4.5'),
    prompt: 'Generate an image of an origami fox in a paper forest',
    tools: {
      image_generation: xai.tools.imageGeneration({ action: 'generate' }),
    },
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'tool-input-start') {
      console.log(`\n[image generation started: ${part.id}]`);
    } else if (part.type === 'tool-result' && !part.dynamic) {
      await presentImages([
        {
          mediaType: 'image/jpeg',
          base64: part.output.result,
          uint8Array: convertBase64ToUint8Array(part.output.result),
        },
      ]);
    }
  }
});
