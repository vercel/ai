import { HarnessAgent } from '@ai-sdk/harness/agent';
import { fx } from '@ai-sdk/harness-fx-v2';
import type { InferUITools, UIMessage } from 'ai';
import { addNoteTool } from '@/lib/add-note-tool';
import { badMarkerTool } from '@/lib/bad-marker-tool';
import { getSandboxSession } from '@/lib/sandbox';
import { getWorld } from '@/lib/world';

/**
 * The fx agent. Durable, since it is given a World other than an
 * `InMemoryWorld`: its `id` is recorded on its sessions' runs, and background
 * drives look the agent up by it.
 */
export const agent = new HarnessAgent({
  id: 'fx-basic',
  harness: fx,
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

export type FxHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof agent.tools>
>;
