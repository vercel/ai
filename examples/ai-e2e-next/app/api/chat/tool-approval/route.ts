import { openaiWeatherToolApprovalAgent } from '@/agent/openai/weather-tool-approval-agent';
import { createAgentUIStreamResponse, MissingToolResultsError } from 'ai';

export async function POST(req: Request) {
  const body = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiWeatherToolApprovalAgent,
    uiMessages: body.messages,
    onError: error => {
      console.error(error);
      return MissingToolResultsError.isInstance(error)
        ? error.message
        : 'An error occurred.';
    },
  });
}
