import { isWriteProtectedPath } from '@ai-sdk/harness/bridge';

/*
 * Workspace paths that hold Codex configuration or skills, which can run code
 * or change the agent's behavior in later sessions. Writes to them always
 * require host approval unless the permission mode is `allow-all`.
 */
export const CODEX_WRITE_PROTECTED_PATHS = ['.agents/skills', '.codex'];

/*
 * Decides whether a Codex file change needs host approval under a Harness
 * permission mode. The Codex harness currently accepts only `allow-all`, which
 * runs Codex with approvals disabled, so the bridge does not call this yet.
 * Built-in tool approvals for Codex must route file changes through it.
 */
export async function codexFileChangeRequiresApproval({
  permissionMode,
  workDir,
  paths,
}: {
  permissionMode: 'allow-reads' | 'allow-edits' | 'allow-all';
  workDir: string;
  paths: ReadonlyArray<string>;
}): Promise<boolean> {
  if (permissionMode === 'allow-all') return false;
  if (permissionMode === 'allow-reads') return true;
  return isWriteProtectedPath({
    workDir,
    paths,
    writeProtectedPaths: CODEX_WRITE_PROTECTED_PATHS,
  });
}
