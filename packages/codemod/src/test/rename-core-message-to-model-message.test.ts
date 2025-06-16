import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/rename-core-message-to-model-message';

describe('rename-core-message-to-model-message', () => {
  it('transforms CoreMessage to ModelMessage correctly', () => {
    testTransform(transformer, 'rename-core-message-to-model-message');
  });
});
