import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transform from '../codemods/rename-request-options';

describe('rename-request-options', () => {
  it('transforms correctly', () => {
    testTransform(transform, 'rename-request-options');
  });
});
