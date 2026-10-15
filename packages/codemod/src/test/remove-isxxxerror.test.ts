import { describe, it } from 'vitest';
import transformer from '../codemods/v4/remove-isxxxerror';
import { testTransform } from './test-utils';

describe('remove-isxxxerror', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-isxxxerror');
  });

  it('keeps aliased and namespaced receivers bound', () => {
    testTransform(transformer, 'remove-isxxxerror-alias');
  });
});
