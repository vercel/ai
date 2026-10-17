// @ts-nocheck
import { generateImage } from 'ai';
import { fal } from '@ai-sdk/fal';

const settings = { maxImagesPerCall: 2, pollIntervalMillis: 500 };

// Spread-only settings are left for manual migration
const spreadOnly = await generateImage({
  model: fal.image('model-id', { ...settings }),
  prompt: 'synthetic',
  n: 6,
});

// Mixed literal and spread settings are left for manual migration too
const mixed = await generateImage({
  model: fal.image('model-id', { maxImagesPerCall: 3, ...settings }),
  prompt: 'synthetic',
  n: 6,
});

// A plain object literal is still migrated
const plain = await generateImage({
  model: fal.image('model-id', { maxImagesPerCall: 4 }),
  prompt: 'synthetic',
  n: 6,
});
