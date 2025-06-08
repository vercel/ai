import { describe, it } from 'vitest';
import { testTransform } from './test-utils';
import transform from '../codemods/rename-languagemodelv1providermetadata';

describe('rename-languagemodelv1providermetadata', () => {
  it('transforms correctly', () => {
    testTransform(transform, 'rename-languagemodelv1providermetadata');
  });
});
