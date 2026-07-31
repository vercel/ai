import { posix } from 'node:path';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { HarnessV1Bootstrap } from '../../v1';

/**
 * Version of the bootstrap recipe shape itself. Bump to force every existing
 * snapshot/marker to be invalidated regardless of recipe content.
 */
export const BOOTSTRAP_SCHEMA_VERSION = 1;

/**
 * Deterministic 16-char hex identity derived from the recipe's content
 * (harnessId, bootstrapDir, file paths + contents, commands, schema version).
 * Two adapters with equivalent recipes produce the same identity; any
 * content change produces a different identity.
 *
 * Used by sandbox providers as part of the persistent sandbox name so
 * recipe changes automatically invalidate snapshots.
 */
export async function hashHarnessBootstrap(
  recipe: HarnessV1Bootstrap,
): Promise<string> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushString = (value: string) => {
    chunks.push(encoder.encode(value));
    chunks.push(encoder.encode('\0'));
  };

  pushString(recipe.harnessId);
  pushString(recipe.bootstrapDir);

  const sortedFiles = [...recipe.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  for (const file of sortedFiles) {
    pushString(file.path);
    pushString(file.content);
  }

  pushString(JSON.stringify(recipe.commands));
  pushString(String(BOOTSTRAP_SCHEMA_VERSION));

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Absolute path of the marker file the framework writes after a recipe runs
 * successfully. Presence of this path inside the sandbox indicates the recipe
 * with the matching `identity` has already been applied.
 */
export function bootstrapMarkerPath({
  recipe,
  identity,
  defaultWorkingDirectory,
}: {
  recipe: HarnessV1Bootstrap;
  identity: string;
  defaultWorkingDirectory: string;
}): string {
  return posix.join(
    resolveBootstrapPath({
      path: recipe.bootstrapDir,
      defaultWorkingDirectory,
    }),
    `.bootstrap-${identity}.ok`,
  );
}

/**
 * Apply a bootstrap recipe to a sandbox session idempotently. Reads the
 * marker file; if it exists, returns immediately. Otherwise creates the
 * bootstrap directory, writes the recipe's files, runs its commands
 * sequentially, and writes the marker on success.
 *
 * Safe to call multiple times. For sandboxes that already contain the
 * recipe (resumed from snapshot, reused across sessions, or applied by
 * an earlier process) this is a single fast read.
 */
export async function applyBootstrapRecipe({
  session,
  recipe,
  identity,
  defaultWorkingDirectory,
  abortSignal,
}: {
  session: SandboxSession;
  recipe: HarnessV1Bootstrap;
  identity: string;
  defaultWorkingDirectory: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const markerPath = bootstrapMarkerPath({
    recipe,
    identity,
    defaultWorkingDirectory,
  });

  const existingMarker = await session.readTextFile({
    path: markerPath,
    abortSignal,
  });
  if (existingMarker !== null) {
    return;
  }

  const bootstrapDir = resolveBootstrapPath({
    path: recipe.bootstrapDir,
    defaultWorkingDirectory,
  });
  const mkdirResult = await session.run({
    command: 'mkdir -p "$BOOTSTRAP_DIR"',
    workingDirectory: defaultWorkingDirectory,
    env: { BOOTSTRAP_DIR: bootstrapDir },
    abortSignal,
  });
  if (mkdirResult.exitCode !== 0) {
    throw new Error(
      `Failed to create bootstrap directory for harness '${recipe.harnessId}' (exit ${mkdirResult.exitCode}): ${bootstrapDir}\n${mkdirResult.stderr || mkdirResult.stdout}`,
    );
  }

  for (const file of recipe.files) {
    await session.writeTextFile({
      path: resolveBootstrapPath({
        path: file.path,
        defaultWorkingDirectory,
      }),
      content: file.content,
      abortSignal,
    });
  }

  for (const cmd of recipe.commands) {
    const result = await session.run({
      command: cmd.command,
      workingDirectory: bootstrapDir,
      abortSignal,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Bootstrap command failed for harness '${recipe.harnessId}' (exit ${result.exitCode}): ${cmd.command}\n${result.stderr || result.stdout}`,
      );
    }
  }

  await session.writeTextFile({
    path: markerPath,
    content: '',
    abortSignal,
  });
}

function resolveBootstrapPath({
  path,
  defaultWorkingDirectory,
}: {
  path: string;
  defaultWorkingDirectory: string;
}): string {
  return posix.isAbsolute(path)
    ? path
    : posix.resolve(defaultWorkingDirectory, path);
}
