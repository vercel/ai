import { createAzure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';
import { convertBase64ToUint8Array } from '../lib/convert-base64';

/**
 *
 * *** NOTICE ***
 * The image_generation function is currently preview(Not GA).
 * Unfortunately ,This example code does not work, now.
 * Because image_generation tool is not supported stream mode on Azure OpenAI, yet.
 * So it doesn't work on streamText function.
 *
 * This example finish error with this message.
 * "ImageGen as a tool is not supported in streaming mode."
 *
 *
 * ` The Responses API image generation tool does not currently support streaming mode. `
 * link:
 * https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses?tabs=python-secure#image-generation-preview
 *
 *
 * When updated on Azure , it will work on streamText function in the future.
 * And then this example code will be fixed.
 */

run(async () => {
  const azure = createAzure({
    headers: {
      'x-ms-oai-image-generation-deployment': 'gpt-image-1', // use your own image model deployment
    },
  });

  const result = streamText({
    model: azure.responses('gpt-4.1-mini'), // use your own deployment
    prompt: `Create an anime-like image of a cute raccoon waving hello.`,
    tools: {
      image_generation: azure.tools.imageGeneration({
        outputFormat: 'png', // on azure , supported extension is png and jpeg.
        quality: 'medium',
        size: '1024x1024',
      }),
    },
  });

  for await (const part of result.fullStream) {
    if (part.type == 'tool-result' && !part.dynamic) {
      await presentImages([
        {
          mediaType: 'image/png',
          base64: part.output.result,
          uint8Array: convertBase64ToUint8Array(part.output.result),
        },
      ]);
    }
  }
});
