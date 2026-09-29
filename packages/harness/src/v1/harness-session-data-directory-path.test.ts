import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';
import { harnessSessionDataDirectoryPath } from './harness-session-data-directory-path';

const stateDirectory = '/home/agent/.ai-sdk-harness';
const agentRunsDirectory = `${stateDirectory}/.agent-runs`;

describe('harnessSessionDataDirectoryPath', () => {
  it('keeps ordinary session IDs readable', () => {
    expect(
      harnessSessionDataDirectoryPath({ stateDirectory, sessionId: 's1-abc' }),
    ).toBe(`${agentRunsDirectory}/s1-abc`);
  });

  it.each([
    ['../../../../work/project', '..%2F..%2F..%2F..%2Fwork%2Fproject'],
    ['/work/project', '%2Fwork%2Fproject'],
    ['..', '%2E%2E'],
    ['.', '%2E'],
    ['', '%'],
    ['%', '%25'],
    ['a/b', 'a%2Fb'],
    ['a%2Fb', 'a%252Fb'],
    ['a\\..', 'a%5C..'],
    ['a\0b', 'a%00b'],
  ])('encodes session ID %j as one path segment', (sessionId, segment) => {
    const directory = harnessSessionDataDirectoryPath({
      stateDirectory,
      sessionId,
    });

    expect(directory).toBe(`${agentRunsDirectory}/${segment}`);
    expect(posix.dirname(directory)).toBe(agentRunsDirectory);
  });
});
