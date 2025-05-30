import { describe, it } from 'vitest';
import transformer from '../codemods/rename-reasoning-to-reasoningText';
import { testTransform } from './test-utils';

describe('rename-reasoning-to-reasoningText', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-reasoning-to-reasoningText');
  });
});
