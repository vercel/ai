import { describe, it } from 'vitest';
import transformer from '../codemods/v7/rename-prepare-call-settings';
import { testTransform } from './test-utils';

describe('rename-prepare-call-settings', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'rename-prepare-call-settings');
  });
});
