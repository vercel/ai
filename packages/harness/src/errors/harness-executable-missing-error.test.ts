import { describe, expect, test } from 'vitest';
import { HarnessError } from './harness-error';
import { HarnessExecutableMissingError } from './harness-executable-missing-error';

describe('HarnessExecutableMissingError', () => {
  test('is a HarnessError', () => {
    const err = new HarnessExecutableMissingError({ executable: 'claude' });
    expect(HarnessError.isInstance(err)).toBe(true);
    expect(HarnessExecutableMissingError.isInstance(err)).toBe(true);
  });

  test('composes an actionable default message from the install command', () => {
    const err = new HarnessExecutableMissingError({
      harnessId: 'claude-code',
      executable: 'claude',
      installCommand: 'npm install -g @anthropic-ai/claude-code',
    });
    expect(err.message).toContain("'claude' executable was not found");
    expect(err.message).toContain('npm install -g @anthropic-ai/claude-code');
    expect(err.message).toContain('onInstallRequest');
    expect(err.harnessId).toBe('claude-code');
    expect(err.executable).toBe('claude');
    expect(err.installCommand).toBe('npm install -g @anthropic-ai/claude-code');
  });

  test('a supplied message wins over the default', () => {
    const err = new HarnessExecutableMissingError({
      executable: 'claude',
      message: 'custom',
    });
    expect(err.message).toBe('custom');
  });

  test('isInstance returns false for unrelated errors', () => {
    expect(HarnessExecutableMissingError.isInstance(new Error('x'))).toBe(
      false,
    );
    expect(HarnessExecutableMissingError.isInstance(null)).toBe(false);
  });
});
