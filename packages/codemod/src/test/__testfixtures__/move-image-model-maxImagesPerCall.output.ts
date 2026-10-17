// @ts-nocheck
import { generateImage } from 'ai';
import { fal } from '@ai-sdk/fal';

const result = await generateImage({
  model: fal.image('model-id'),
  prompt: 'A sunset',
  n: 10,
  maxImagesPerCall: 5,

  providerOptions: {
    fal: {
      pollIntervalMillis: 500
    }
  }
});
