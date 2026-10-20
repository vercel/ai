import { afterEach, describe, it, expect, vi } from 'vitest';
import { getEnvironment } from './get-environment';

describe('getEnvironment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not mutate the original custom environment object', () => {
    const customEnv = { CUSTOM_VAR: 'custom_value' };

    const result = getEnvironment(customEnv);

    expect(customEnv).toStrictEqual({ CUSTOM_VAR: 'custom_value' });
    expect(result).not.toBe(customEnv);
  });

  it('should let a custom value override an inherited default', () => {
    const result = getEnvironment({ PATH: 'custom-path' });

    expect(result.PATH).toBe('custom-path');
  });

  it('should match custom environment keys case-insensitively on Windows', () => {
    vi.spyOn(globalThis.process, 'platform', 'get').mockReturnValue('win32');

    const result = getEnvironment({ Path: 'custom-path' });

    expect(result.Path).toBe('custom-path');
    expect(result).not.toHaveProperty('PATH');
  });
});
