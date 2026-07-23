import { describe, expect, it } from 'vitest';
import * as testExports from './index';

describe('test exports', () => {
  it('does not include test server utilities', () => {
    expect(testExports).not.toHaveProperty('createTestServer');
  });
});
