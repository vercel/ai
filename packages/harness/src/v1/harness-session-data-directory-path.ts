import { posix } from 'node:path';

/**
 * Encode an arbitrary string as exactly one filesystem path segment. The
 * mapping is injective: distinct inputs always produce distinct segments, and
 * the result never contains a path separator or resolves to `.` or `..`. This
 * makes it safe to join the result below a fixed parent directory without the
 * joined path escaping that parent or aliasing another input's directory.
 * Strings containing lone UTF-16 surrogates throw a `URIError`.
 */
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
