import { describe, it } from 'vitest';
import transformer from '../codemods/v5/rename-reasoning-to-reasoningText';
import { testTransform } from './test-utils';

describe('rename-reasoning-to-reasoningText', () => {
  it('transforms steps reasoning without touching component props', () => {
    testTransform(transformer, 'rename-reasoning-to-reasoningText');
  });
});
