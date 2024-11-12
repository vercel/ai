import { describe, it } from 'vitest';
import transformer from '../codemods/update-telemetry-data';
import { testTransform } from './test-utils';

describe('update-telemetry-data', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'update-telemetry-data');
  });
});
