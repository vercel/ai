import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi-v2';
import type { InferUITools, UIMessage } from 'ai';
import { addNoteTool } from '@/lib/add-note-tool';
import { getSandboxSession } from '@/lib/sandbox';
import { weatherTool } from '@/lib/weather-tool';
import { getWorld } from '@/lib/world';

/**
 * The Pi agent whose tools each need the user's approval before they run.
 * A turn that calls them waits for the user's responses, which the chat
 * sends back with its next request.
 */
export const agent = new HarnessAgent({
  id: 'pi-weather-tool-approval',
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
  tools: { weather: weatherTool, addNote: addNoteTool },
  toolApproval: { weather: 'user-approval', addNote: 'user-approval' },
});

export type PiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof agent.tools>
>;
