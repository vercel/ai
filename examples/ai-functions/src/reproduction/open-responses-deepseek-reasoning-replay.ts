import { createOpenResponses } from '@ai-sdk/open-responses';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const requestBodies: unknown[] = [];

  const deepseek = createOpenResponses({
    name: 'deepseek',
    url: 'https://api.deepseek.com/v1/responses',
    apiKey: process.env.DEEPSEEK_API_KEY,
    fetch: async (url, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(JSON.parse(init.body));
      }

      return fetch(url, init);
    },
  });

  const result = await generateText({
    model: deepseek('deepseek-v4-flash'),
    prompt: 'Call get_date now. Do not answer without calling the tool.',
    tools: {
      get_date: tool({
        description: 'Get the current date',
        inputSchema: z.object({}),
        execute: async () => 'August 6, 2026',
      }),
    },
    stopWhen: isStepCount(2),
    maxOutputTokens: 2048,
  });

  if (result.steps.length !== 2) {
    throw new Error(
      `PRIMARY BUG: expected a two-step tool loop, received ${result.steps.length} step(s)`,
    );
  }

  const firstStep = result.steps[0];
  if (firstStep.reasoning.length === 0 || firstStep.toolCalls.length === 0) {
    throw new Error(
      'SETUP FAILURE: DeepSeek did not return both reasoning and a tool call in round 1',
    );
  }

  const secondRequest = requestBodies[1] as
    | {
        input?: Array<{
          type?: string;
          call_id?: string;
        }>;
      }
    | undefined;
  const replayedReasoning =
    secondRequest?.input?.some(item => item.type === 'reasoning') ?? false;
  const replayedFunctionCall = secondRequest?.input?.find(
    item => item.type === 'function_call',
  );

  if (replayedReasoning) {
    throw new Error(
      'SETUP FAILURE: target branch unexpectedly replayed reasoning, so the reported request shape was not exercised',
    );
  }

  if (replayedFunctionCall?.call_id !== firstStep.toolCalls[0].toolCallId) {
    throw new Error(
      'SETUP FAILURE: round 2 did not replay the provider-issued tool call ID',
    );
  }

  console.log(
    `PRIMARY OUTCOME: tool loop completed with final text: ${JSON.stringify(result.text)}`,
  );
  console.log(
    `SECONDARY OUTCOME: round 2 reasoning item replayed: ${replayedReasoning}`,
  );
  console.log(
    'NARROWING OUTCOME: round 2 retained the provider-issued tool call ID',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
