import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const requestBodies: Array<Record<string, unknown>> = [];
const openai = createOpenAI({
  fetch: async (input, init) => {
    if (typeof init?.body === 'string') {
      requestBodies.push(JSON.parse(init.body));
    }

    return fetch(input, init);
  },
});

async function runTurn(prompt: string, previousResponseId?: string) {
  let toolExecutionCount = 0;
  const myTool = tool({
    description: 'Search for shoes by color.',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => {
      toolExecutionCount++;
      return { result: `results for ${query}` };
    },
  });

  const result = streamText({
    model: openai.responses('gpt-4.1-mini'),
    prompt,
    tools: { myTool },
    stopWhen: stepCountIs(2),
    providerOptions: {
      openai: {
        store: true,
        ...(previousResponseId == null ? {} : { previousResponseId }),
      },
    },
  });

  let streamError: unknown;
  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      streamError = part.error;
    }
  }

  if (streamError != null) {
    throw streamError;
  }

  const providerMetadata = await result.providerMetadata;
  const responseId = providerMetadata?.openai?.responseId;

  if (typeof responseId !== 'string') {
    throw new Error('Turn completed without an OpenAI responseId');
  }

  const text = await result.text;
  if (text.length === 0) {
    throw new Error('Turn completed without a final text response');
  }

  if (toolExecutionCount !== 1) {
    throw new Error(
      `Expected exactly one client tool execution, received ${toolExecutionCount}`,
    );
  }

  return { responseId, text };
}

async function main() {
  const firstTurn = await runTurn(
    'Use myTool to search for red shoes, then briefly summarize the result.',
  );

  try {
    await runTurn(
      'Use myTool to search for blue shoes, then briefly summarize the result.',
      firstTurn.responseId,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes(
        'No tool call found for function call output with call_id',
      )
    ) {
      throw new Error(`ISSUE_18537_REPRODUCED: ${message}`);
    }

    throw error;
  }

  const chainedRequestBodies = requestBodies.filter(
    body => body.previous_response_id === firstTurn.responseId,
  );
  if (chainedRequestBodies.length !== 2) {
    throw new Error(
      `Expected two follow-up API requests chained to ${firstTurn.responseId}, received ${chainedRequestBodies.length}`,
    );
  }

  console.log(
    'ISSUE_18537_NOT_REPRODUCED: both the initial and previousResponseId-chained client-tool turns completed',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
