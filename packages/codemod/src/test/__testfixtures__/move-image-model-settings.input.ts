// @ts-nocheck
import { luma } from '@ai-sdk/luma';
import { generateImage } from 'ai';

const result = generateImage({
  model: luma.image('model', {
    maxImagesPerCall: 1,
    pollIntervalMillis: 500,
  }),
  prompt: 'test',
});
