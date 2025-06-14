import { describe, it } from 'vitest';
import transformer from '../codemods/move-image-model-maxImagesPerCall';
import { testTransform } from './test-utils';

describe('move-image-model-maxImagesPerCall', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'move-image-model-maxImagesPerCall');
  });
});
