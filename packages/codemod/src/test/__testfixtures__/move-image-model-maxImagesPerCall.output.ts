// @ts-nocheck

import { luma } from '@ai-sdk/luma';
import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage } from 'ai';

// Basic case with settings
await generateImage({
  model: luma.image('photon-flash-1'),
  prompt: 'A beautiful landscape',
  n: 10,
  maxImagesPerCall: 5,

  providerOptions: {
    luma: {
      pollIntervalMillis: 500
    }
  }
});

// Case with only maxImagesPerCall
await generateImage({
  model: openai.image('dall-e-2'),
  prompt: 'A cat',
  n: 6,
  maxImagesPerCall: 3
});

// Case with other provider settings but no maxImagesPerCall
await generateImage({
  model: luma.image('photon-1'),
  prompt: 'A dog',

  providerOptions: {
    luma: {
      pollIntervalMillis: 1000,
      maxPollAttempts: 20
    }
  }
});

// Case with existing providerOptions that should be merged
await generateImage({
  model: luma.image('photon-flash-1'),
  prompt: 'A bird',
  providerOptions: {
    luma: {
      existingSetting: 'value',
      pollIntervalMillis: 500
    },
  },
});

// Case with existing providerOptions for different provider
await generateImage({
  model: luma.image('photon-1'),
  prompt: 'A tree',

  providerOptions: {
    openai: {
      style: 'vivid',
    },

    luma: {
      pollIntervalMillis: 750
    }
  },

  maxImagesPerCall: 2
});

// Case with no settings (should not be changed)
await generateImage({
  model: luma.image('photon-flash-1'),
  prompt: 'A mountain',
});

// Multiple settings
await generateImage({
  model: luma.image('photon-1'),
  prompt: 'A sunset',
  n: 8,
  maxImagesPerCall: 4,

  providerOptions: {
    luma: {
      pollIntervalMillis: 200,
      maxPollAttempts: 50
    }
  }
}); 