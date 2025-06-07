import { describe, it } from 'vitest';
import transformer from '../codemods/replace-simulate-streaming';
import { testTransform } from './test-utils';

describe('replace-simulate-streaming', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-simulate-streaming');
  });
});
