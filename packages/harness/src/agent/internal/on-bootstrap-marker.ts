import { posix } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { harnessStateDirectoryPath } from '../../v1';
import { resolveSandboxHomeDir } from '../../utils/sandbox-home-dir';

export async function onBootstrapMarkerPath({
  session,
  bootstrapHash,
  abortSignal,
}: {
  session: SandboxSession;
  bootstrapHash: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(bootstrapHash),
    ),
  );
  const filename = Array.from(digest, byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return posix.join(
    harnessStateDirectoryPath({
      sandboxHomeDir: await resolveSandboxHomeDir({
        sandbox: session,
        abortSignal,
      }),
    }),
    '.on-bootstrap',
    `${filename}.ok`,
  );
}

export async function hasOnBootstrapMarker(options: {
  session: SandboxSession;
  bootstrapHash: string;
  abortSignal?: AbortSignal;
}): Promise<boolean> {
  return (
    (await options.session.readTextFile({
      path: await onBootstrapMarkerPath(options),
      abortSignal: options.abortSignal,
    })) !== null
  );
}

export async function writeOnBootstrapMarker(options: {
  session: SandboxSession;
  bootstrapHash: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const path = await onBootstrapMarkerPath(options);
  const result = await options.session.run({
    command: 'mkdir -p "$MARKER_DIR"',
    env: { MARKER_DIR: posix.dirname(path) },
    abortSignal: options.abortSignal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to create onBootstrap marker directory: ${result.stderr || result.stdout}`,
    );
  }
  await options.session.writeTextFile({
    path,
    content: '',
    abortSignal: options.abortSignal,
  });
}
