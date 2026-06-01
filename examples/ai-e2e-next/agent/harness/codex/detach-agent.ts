import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

/*
 * Same as `basic-agent`, but its route detaches the session at the end of each
 * turn (stopping the sandbox) rather than keeping it warm — so the next request
 * resumes from the snapshot (`rerun`) instead of attaching to a live bridge.
 * The chat UI reuses `CodexHarnessChat`, which sources its message type from
 * `basic-agent`, so no message-type export is needed here.
 */
export const codexDetachHarnessAgent = new HarnessAgent({
  harness: codex,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});
