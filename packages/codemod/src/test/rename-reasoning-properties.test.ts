import { describe, it } from 'vitest';
import transformer from '../codemods/v5/rename-reasoning-properties';
import { testTransform } from './test-utils';

describe('rename-reasoning-properties', () => {
  it('transforms AI SDK reasoning result and step properties only', () => {
    testTransform(transformer, 'rename-reasoning-properties');
  });
});
