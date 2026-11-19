import { openaiShellSkillsAgent } from '@/agent/openai/shell-skills-agent';
import { createAgentUIStreamResponse } from 'ai';
import { isLocalDevelopmentRequest } from '../../code-execution-files/is-local-development-request';

export async function POST(req: Request) {
  if (!isLocalDevelopmentRequest(req)) {
    return new Response('Local shell is only available in local development.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const body = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiShellSkillsAgent,
    uiMessages: body.messages,
  });
}
