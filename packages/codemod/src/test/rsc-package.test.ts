import { describe, it } from 'vitest';
import transformer from '../codemods/rsc-package';
import { testTransform } from './test-utils';

describe('rsc-package', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rsc-package');
  });
});
