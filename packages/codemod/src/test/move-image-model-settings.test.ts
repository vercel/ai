import { describe, it } from 'vitest';
import transformer from '../codemods/v5/move-image-model-maxImagesPerCall';
import { testTransform } from './test-utils';

describe('move-image-model-maxImagesPerCall', () => {
  it('moves image model settings for a provider import', () => {
    testTransform(transformer, 'move-image-model-settings');
  });

  it('uses the provider options namespace for an aliased provider import', () => {
    testTransform(transformer, 'move-image-model-settings-provider-alias');
  });
});
