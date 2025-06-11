import { describe, it } from 'vitest';
import transformer from '../codemods/migrate-to-data-stream-protocol-v2';
import { testTransform } from './test-utils';

describe('migrate-to-data-stream-protocol-v2', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'migrate-to-data-stream-protocol-v2');
  });
});
