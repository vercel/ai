import { describe, it } from 'vitest';
import transformer from '../codemods/replace-bedrock-snake-case';
import { testTransform } from './test-utils';

describe('replace-bedrock-snake-case', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-bedrock-snake-case');
  });
});
