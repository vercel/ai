import { describe, it } from 'vitest';
import transformer from '../codemods/v7/rename-experimental-include';
import { testTransform } from './test-utils';

describe('rename-experimental-include', () => {
  it('transforms experimental_include to include in generateText and streamText', () => {
    testTransform(transformer, 'rename-experimental-include');
  });
});
