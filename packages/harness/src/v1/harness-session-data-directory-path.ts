import { posix } from 'node:path';

export function encodeHarnessPathSegment(value: string): string {
  const encoded = encodeURIComponent(value);
  if (encoded === '') return '%';
  if (encoded === '.') return '%2E';
  if (encoded === '..') return '%2E%2E';
  return encoded;
}

/**
 * Return the per-session harness state path under `.agent-runs`. Session IDs
 * occupy one encoded path segment, so path separators and parent-directory
 * references cannot move session data outside the harness state directory.
 */
export function harnessSessionDataDirectoryPath({
  stateDirectory,
  sessionId,
}: {
  stateDirectory: string;
  sessionId: string;
}): string {
  return posix.join(
    stateDirectory,
    '.agent-runs',
    encodeHarnessPathSegment(sessionId),
  );
}
