import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi-v2';
import type { InferUITools, UIMessage } from 'ai';
import { getSandboxSession } from '@/lib/sandbox';
import { getWorld } from '@/lib/world';

export const Agent = new HarnessAgent({
  harness: pi,
  world: getWorld(),
  getSandboxSession,
});

export type PiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof Agent.tools>
>;
