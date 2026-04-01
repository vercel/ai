import { anthropicWebFetchAgent } from '@/agent/anthropic/web-fetch-agent';
import { createAgentUIStreamResponse, registerTelemetryIntegration } from 'ai';
import { OpenTelemetryIntegration } from '@ai-sdk/otel';

registerTelemetryIntegration(new OpenTelemetryIntegration());

export async function POST(request: Request) {
  const body = await request.json();

  return createAgentUIStreamResponse({
    agent: anthropicWebFetchAgent,
    uiMessages: body.messages,
    sendSources: true,
  });
}
