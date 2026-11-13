import {
  createVercelNetworkSandboxSession,
  resumeVercelNetworkSandboxSession,
} from '@ai-sdk/sandbox-vercel';

/**
 * Creates a new Vercel Sandbox for a new agent session.
 */
export function createSandboxSession() {
  return createVercelNetworkSandboxSession();
}

/**
 * Reacquires the Vercel Sandbox of an existing agent session by its ID,
 * resuming it if it stopped.
 */
export function getSandboxSession({ sandboxId }: { sandboxId: string }) {
  return resumeVercelNetworkSandboxSession({ sandboxId });
}
