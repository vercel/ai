import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transform from '../codemods/replace-experimental-provider-metadata';

describe('replace-experimental-provider-metadata', () => {
  it('transforms correctly', () => {
    testTransform(transform, 'replace-experimental-provider-metadata');
  });
});
