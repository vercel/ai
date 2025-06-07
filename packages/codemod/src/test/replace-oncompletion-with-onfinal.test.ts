import { describe, it } from 'vitest';
import transformer from '../codemods/replace-oncompletion-with-onfinal';
import { testTransform } from './test-utils';

describe('replace-oncompletion-with-onfinal', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-oncompletion-with-onfinal');
  });
}); 