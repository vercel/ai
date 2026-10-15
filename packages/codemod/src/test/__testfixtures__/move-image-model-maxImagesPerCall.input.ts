// @ts-nocheck
import { generateImage } from 'ai';
import { fal } from '@ai-sdk/fal';

const result = await generateImage({
  model: fal.image('model-id', {
    maxImagesPerCall: 5,
    pollIntervalMillis: 500,
  }),
  prompt: 'A sunset',
  n: 10,
});
