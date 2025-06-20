import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transform from '../codemods/replace-content-with-parts';

describe('replace-content-with-parts', () => {
  it('transforms correctly', () => {
    testTransform(transform, 'replace-content-with-parts');
  });
});
