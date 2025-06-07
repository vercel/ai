import { describe, it } from 'vitest';
import transformer from '../codemods/replace-llamaindex-adapter';
import { testTransform } from './test-utils';

describe('replace-llamaindex-adapter', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'replace-llamaindex-adapter');
  });
}); 