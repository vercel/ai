import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transformer from '../codemods/rename-reasoning-properties';

describe('rename-reasoning-properties', () => {
  it('transforms basic reasoning properties correctly', () => {
    testTransform(transformer, 'rename-reasoning-properties-basic');
  });

  it('transforms mixed destructuring patterns correctly', () => {
    testTransform(transformer, 'rename-reasoning-properties-mixed');
  });
});
