// @ts-nocheck
import { luma as images } from '@ai-sdk/luma';
import { generateImage } from 'ai';

const result = generateImage({
  model: images.image('model'),
  prompt: 'test',
  maxImagesPerCall: 1,

  providerOptions: {
    luma: {
      pollIntervalMillis: 500
    }
  }
});
