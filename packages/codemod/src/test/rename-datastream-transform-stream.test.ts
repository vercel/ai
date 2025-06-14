import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transform from '../codemods/rename-datastream-transform-stream';

describe('rename-datastream-transform-stream', () => {
  it('transforms correctly', () => {
    testTransform(transform, 'rename-datastream-transform-stream');
  });
});
