import { describe, it } from 'vitest';
import transformer from '../codemods/v5/remove-todatastreamresponse-two-step';
import { testTransform } from './test-utils';

describe('remove-todatastreamresponse-two-step', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'remove-todatastreamresponse-two-step');
  });
});
