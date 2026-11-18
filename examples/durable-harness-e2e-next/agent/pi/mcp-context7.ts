import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi-v2';
import type { InferUITools, UIMessage } from 'ai';
import { addNoteTool } from '@/lib/add-note-tool';
import { badMarkerTool } from '@/lib/bad-marker-tool';
import { getSandboxSession } from '@/lib/sandbox';
import { getWorld } from '@/lib/world';

export const agent = new HarnessAgent({
  id: 'pi-mcp-context7',
  harness: pi,
  world: getWorld(),
  getSandboxSession,
  sandboxConfig: { workDir: '.' },
  tools: { badMarker: badMarkerTool, addNote: addNoteTool },
  mcpServers: {
    context7: { url: 'https://mcp.context7.com/mcp' },
  },
});

export type PiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof agent.tools>
>;
