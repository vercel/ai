// @ts-nocheck
import { luma } from '@ai-sdk/luma';
import { generateImage } from 'ai';

const result = generateImage({
  model: luma.image('model'),
  prompt: 'test',
  maxImagesPerCall: 1,

  providerOptions: {
    luma: {
      pollIntervalMillis: 500
    }
  }
});
