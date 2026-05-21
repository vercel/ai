import {
  sandboxAgent,
  type SandboxAgentUIMessage,
} from '@/agent/openai/sandbox-agent';
import { createAgentUIStreamResponse } from 'ai';
import { Sandbox } from '@vercel/sandbox';
import { VercelSandbox } from '@/sandbox/vercel-sandbox';

async function getSandbox(sandboxId?: string) {
  if (sandboxId != null) {
    try {
      const sandbox = await Sandbox.get({ sandboxId });
      if (sandbox.status !== 'stopped' && sandbox.status !== 'failed') {
        return sandbox;
      }
    } catch {
      // If the previous sandbox is gone, fall through and create a new one.
    }
  }

  return Sandbox.create({ timeout: 60_000 * 3 });
}

function getLatestSandboxId(messages: SandboxAgentUIMessage[]) {
  return messages.findLast(message => message.metadata?.sandboxId)?.metadata
    ?.sandboxId;
}

export async function POST(req: Request) {
  const { messages }: { messages: SandboxAgentUIMessage[] } = await req.json();

  const vercelSandbox = await getSandbox(getLatestSandboxId(messages));

  const sandbox = new VercelSandbox(vercelSandbox);

  return createAgentUIStreamResponse({
    agent: sandboxAgent,
    uiMessages: messages,
    originalMessages: messages,
    experimental_sandbox: sandbox,
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { sandboxId: vercelSandbox.sandboxId };
      }
    },
  });
}
