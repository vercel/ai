import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { harnessV1StateDirectoryFromHome } from '../v1';

/**
 * Root of the Harness SDK's own state on this machine. This is SDK state —
 * bootstrap recipes and their dependencies, per-session run state — not the
 * runtimes' stores (`~/.claude`, `~/.codex`, …), which each runtime keeps
 * managing itself.
 *
 * Always `~/.ai-sdk-harness`, the same fixed root every other sandbox
 * provider resolves through {@link harnessV1StateDirectoryFromHome}. Not
 * configurable, so every workspace on a machine shares one predictable,
 * discoverable location.
 */
export function localWorkspaceStateRoot(): string {
  return harnessV1StateDirectoryFromHome(homedir());
}

/**
 * The per-project state directory for a workspace, keyed so a human can find
 * it (`<project basename>-<hash>`) and a tool can map it back
 * (`manifest.json` records the absolute project path).
 *
 * Keyed by the realpath'd project path, so the same project reached through
 * different symlinks shares one store, and two projects with the same
 * basename never collide.
 */
export function localWorkspaceStateDirectory(projectPath: string): string {
  const key = `${sanitizeBasename(basename(projectPath))}-${hashPath(projectPath)}`;
  return join(localWorkspaceStateRoot(), 'projects', key);
}

/**
 * Create the state directory and write/refresh its `manifest.json`, the
 * reverse mapping from state to project. `createdAt` is preserved across
 * refreshes; `lastUsedAt` always advances.
 */
export async function ensureLocalWorkspaceStateDirectory({
  stateDirectory,
  projectPath,
}: {
  stateDirectory: string;
  projectPath: string;
}): Promise<void> {
  await mkdir(stateDirectory, { recursive: true });

  const manifestPath = join(stateDirectory, 'manifest.json');
  const now = new Date().toISOString();
  let createdAt = now;
  const existing = await readFile(manifestPath, 'utf8').catch(() => null);
  if (existing != null) {
    // A corrupt manifest is rewritten wholesale; it is derived state.
    const parsed = await safeParseJSON({ text: existing });
    const parsedCreatedAt = parsed.success
      ? (parsed.value as { createdAt?: unknown } | null)?.createdAt
      : undefined;
    if (typeof parsedCreatedAt === 'string') createdAt = parsedCreatedAt;
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({ projectPath, createdAt, lastUsedAt: now }, null, 2)}\n`,
  );
}

function sanitizeBasename(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const trimmed = sanitized.replace(/^-+|-+$/g, '').slice(0, 40);
  return trimmed.length > 0 ? trimmed : 'project';
}

function hashPath(projectPath: string): string {
  return createHash('sha256').update(projectPath).digest('hex').slice(0, 8);
}
