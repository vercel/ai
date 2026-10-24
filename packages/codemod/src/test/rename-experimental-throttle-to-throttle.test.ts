import { describe, it } from 'vitest';
import transformer from '../codemods/v7/rename-experimental-throttle-to-throttle';
import { testTransform } from './test-utils';

describe('rename-experimental-throttle-to-throttle', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-experimental-throttle-to-throttle');
  });
});
