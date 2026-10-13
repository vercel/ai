// @ts-nocheck
import { luma as images } from '@ai-sdk/luma';
import { generateImage } from 'ai';

const result = generateImage({
  model: images.image('model', {
    maxImagesPerCall: 1,
    pollIntervalMillis: 500,
  }),
  prompt: 'test',
});
