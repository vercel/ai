import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { convertBase64ToUint8Array } from '../../lib/convert-base64';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4.5'),
    prompt:
      'Generate an image of a corgi surfing a big wave, in the style of a Japanese woodblock print',
    tools: {
      image_generation: xai.tools.imageGeneration(),
    },
  });

  console.log(result.text);

  for (const toolResult of result.staticToolResults) {
    if (toolResult.toolName === 'image_generation') {
      console.log('Image prompt:', toolResult.output.prompt);
      await presentImages([
        {
          mediaType: 'image/jpeg',
          base64: toolResult.output.result,
          uint8Array: convertBase64ToUint8Array(toolResult.output.result),
        },
      ]);
    }
  }
});
