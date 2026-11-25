import { describe, expect, it } from 'vitest';
import { harnessStateDirectoryPath } from './harness-v1-network-sandbox-session';

describe('harnessStateDirectoryPath', () => {
  it('uses the sandbox HOME for state', () => {
    expect(harnessStateDirectoryPath({ sandboxHomeDir: '/home/agent' })).toBe(
      '/home/agent/.ai-sdk-harness',
    );
  });

  it('can form the symbolic path used by the bootstrap hash', () => {
    expect(harnessStateDirectoryPath({ sandboxHomeDir: '$HOME' })).toBe(
      '$HOME/.ai-sdk-harness',
    );
  });
});
