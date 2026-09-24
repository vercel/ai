import { afterEach, describe, it, expect, vi } from 'vitest';
import { getEnvironment } from './get-environment';

describe('getEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should not mutate the original custom environment object', () => {
    const customEnv = { CUSTOM_VAR: 'custom_value' };

    const result = getEnvironment(customEnv);

    expect(customEnv).toStrictEqual({ CUSTOM_VAR: 'custom_value' });
    expect(result).not.toBe(customEnv);
  });

  it('should inherit default variables from the parent process', () => {
    vi.stubEnv('PATH', 'parent-path');

    expect(getEnvironment().PATH).toBe('parent-path');
    expect(getEnvironment({ CUSTOM_VAR: 'custom_value' })).toMatchObject({
      PATH: 'parent-path',
      CUSTOM_VAR: 'custom_value',
    });
  });

  it('should let an explicit custom value override an inherited default', () => {
    vi.stubEnv('PATH', 'parent-path');

    const result = getEnvironment({ PATH: 'custom-path' });

    expect(result.PATH).toBe('custom-path');
  });

  it('should let explicit values override every inherited default on this platform', () => {
    const inheritedKeys =
      globalThis.process.platform === 'win32'
        ? [
            'APPDATA',
            'HOMEDRIVE',
            'HOMEPATH',
            'LOCALAPPDATA',
            'PATH',
            'PROCESSOR_ARCHITECTURE',
            'SYSTEMDRIVE',
            'SYSTEMROOT',
            'TEMP',
            'USERNAME',
            'USERPROFILE',
          ]
        : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];
    for (const key of inheritedKeys) {
      vi.stubEnv(key, `parent-${key}`);
    }
    const customEnv = Object.fromEntries(
      inheritedKeys.map(key => [key, `custom-${key}`]),
    );

    expect(getEnvironment(customEnv)).toStrictEqual(customEnv);
  });

  it.runIf(process.platform === 'win32')(
    'should let an explicit value override an inherited default with different casing on Windows',
    () => {
      vi.stubEnv('PATH', 'parent-path');

      const result = getEnvironment({ Path: 'custom-path' });

      expect(result.Path).toBe('custom-path');
      expect(result).not.toHaveProperty('PATH');
    },
  );
});
