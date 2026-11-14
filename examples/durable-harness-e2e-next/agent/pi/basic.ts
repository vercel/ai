import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi-v2';
import type { InferUITools, UIMessage } from 'ai';
import { addNoteTool } from '@/lib/add-note-tool';
import { badMarkerTool } from '@/lib/bad-marker-tool';
import { getSandboxSession } from '@/lib/sandbox';
import { getWorld } from '@/lib/world';

/**
 * Queue prefix of the Pi agent's drive queue. Each harness has a queue of
 * its own, so that a drive message only reaches the agent that owns its
 * session.
 */
export const DRIVE_QUEUE_PREFIX = '__harnesspi_wkf_workflow_';

function createAgent() {
  return new HarnessAgent({
    harness: pi,
    world: getWorld(),
    getSandboxSession,
    /*
     * The app's own tools get the sandbox session, whose relative paths
     * resolve against the sandbox's default working directory, so the agent
     * works in that same directory instead of a per-session subdirectory.
     * Otherwise a file that `addNote` writes to `NOTE.md` is not at
     * `NOTE.md` for the agent's own tools.
     */
    sandboxConfig: { workDir: '.' },
    tools: { badMarker: badMarkerTool, addNote: addNoteTool },
  });
}

const agentGlobal = globalThis as {
  __durableHarnessE2EPiAgent?: ReturnType<typeof createAgent>;
};

/**
 * The process's agent, created on first use.
 *
 * It is cached on `globalThis`, like the World, since Next compiles route
 * handlers and `instrumentation.ts` into separate module graphs, and the
 * agent guards against a second drive of a session in the same process with
 * state of its own module instance. Every drive in the process, from a chat
 * request or from the drive queue, must go through one agent for that guard
 * to hold.
 */
export const agent = (agentGlobal.__durableHarnessE2EPiAgent ??= createAgent());

export type PiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof agent.tools>
>;
