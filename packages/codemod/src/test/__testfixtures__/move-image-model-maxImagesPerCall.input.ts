// @ts-nocheck

import { luma } from '@ai-sdk/luma';
import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';

// Basic case with settings
await generateImage({
  model: luma.image('photon-flash-1', {
    maxImagesPerCall: 5,
    pollIntervalMillis: 500,
  }),
  prompt: 'A beautiful landscape',
  n: 10,
});

// Case with only maxImagesPerCall
await generateImage({
  model: openai.image('dall-e-2', {
    maxImagesPerCall: 3,
  }),
  prompt: 'A cat',
  n: 6,
});

// Case with other provider settings but no maxImagesPerCall
await generateImage({
  model: luma.image('photon-1', {
    pollIntervalMillis: 1000,
    maxPollAttempts: 20,
  }),
  prompt: 'A dog',
});

// Case with existing providerOptions that should be merged
await generateImage({
  model: luma.image('photon-flash-1', {
    pollIntervalMillis: 500,
  }),
  prompt: 'A bird',
  providerOptions: {
    luma: {
      existingSetting: 'value',
    },
  },
});

// Case with existing providerOptions for different provider
await generateImage({
  model: luma.image('photon-1', {
    maxImagesPerCall: 2,
    pollIntervalMillis: 750,
  }),
  prompt: 'A tree',
  providerOptions: {
    openai: {
      style: 'vivid',
    },
  },
});

// Case with no settings (should not be changed)
await generateImage({
  model: luma.image('photon-flash-1'),
  prompt: 'A mountain',
});

// Multiple settings
await generateImage({
  model: luma.image('photon-1', {
    maxImagesPerCall: 4,
    pollIntervalMillis: 200,
    maxPollAttempts: 50,
  }),
  prompt: 'A sunset',
  n: 8,
}); 