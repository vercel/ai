import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

type RecordedCall = {
  url: string;
  init: RequestInit;
  requestBody: string | undefined;
  status: number;
  responseBody: string;
};

type ToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

const calls: RecordedCall[] = [];

const openai = createOpenAI({
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    calls.push({
      url: input.toString(),
      init: init ?? {},
      requestBody: typeof init?.body === 'string' ? init.body : undefined,
      status: response.status,
      responseBody: await response.clone().text(),
    });
    return response;
  },
});

const search = tool({
  description: 'Search for products matching a query.',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: `results for ${query}` }),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runTurn({
  prompt,
  previousResponseId,
}: {
  prompt: string;
  previousResponseId?: string;
}) {
  let streamError: unknown;
  let latestToolCall: ToolCall | undefined;

  const result = streamText({
    model: openai.responses('gpt-4.1-mini'),
    prompt,
    tools: { search },
    stopWhen: stepCountIs(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? {
            activeTools: ['search'],
            toolChoice: { type: 'tool' as const, toolName: 'search' },
          }
        : { activeTools: [] },
    providerOptions: {
      openai: {
        previousResponseId,
        store: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      latestToolCall = {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      };
    } else if (part.type === 'error') {
      streamError = part.error;
    }
  }

  const providerMetadata = (await result.providerMetadata) as
    | OpenaiResponsesProviderMetadata
    | undefined;

  return {
    error: streamError,
    responseId: providerMetadata?.openai.responseId,
    latestToolCall,
  };
}

async function retryWithMatchingFunctionCall(toolCall: ToolCall) {
  const failedCall = [...calls].reverse().find(call => call.status === 400);
  if (failedCall?.requestBody == null) {
    throw new Error('Could not find the failed OpenAI request.');
  }

  const body = JSON.parse(failedCall.requestBody) as {
    input: Array<Record<string, unknown>>;
  };
  const outputIndex = body.input.findIndex(
    item =>
      item.type === 'function_call_output' &&
      item.call_id === toolCall.toolCallId,
  );
  if (outputIndex === -1) {
    throw new Error('Failed request did not contain the function call output.');
  }

  body.input.splice(outputIndex, 0, {
    type: 'function_call',
    call_id: toolCall.toolCallId,
    name: toolCall.toolName,
    arguments: JSON.stringify(toolCall.input),
  });

  return fetch(failedCall.url, {
    ...failedCall.init,
    body: JSON.stringify(body),
  });
}

async function main() {
  const firstTurn = await runTurn({ prompt: 'Search for red shoes.' });
  if (firstTurn.error != null) {
    throw new Error(
      `First turn unexpectedly failed: ${errorMessage(firstTurn.error)}`,
    );
  }
  if (firstTurn.responseId == null) {
    throw new Error('First turn did not return an OpenAI response ID.');
  }
  if (firstTurn.latestToolCall == null) {
    throw new Error('First turn did not make the forced client tool call.');
  }
  console.log('First client-tool turn completed.');

  const followUp = await runTurn({
    prompt: 'Now search for blue shoes.',
    previousResponseId: firstTurn.responseId,
  });
  if (followUp.error == null) {
    throw new Error(
      'Issue 18537 did not reproduce: the follow-up client-tool turn completed.',
    );
  }
  if (followUp.latestToolCall == null) {
    throw new Error(
      `Follow-up failed before making a client tool call: ${errorMessage(followUp.error)}`,
    );
  }

  const failedCall = [...calls].reverse().find(call => call.status === 400);
  console.log(`Follow-up OpenAI status: ${failedCall?.status}`);
  console.log(`Follow-up OpenAI response: ${failedCall?.responseBody}`);

  const repairedResponse = await retryWithMatchingFunctionCall(
    followUp.latestToolCall,
  );
  const repairedBody = await repairedResponse.text();
  console.log(`Direct repaired OpenAI status: ${repairedResponse.status}`);
  if (
    !repairedResponse.ok ||
    !repairedBody.includes('"type":"response.completed"')
  ) {
    throw new Error(
      `Direct repaired OpenAI request did not complete: ${repairedBody}`,
    );
  }

  throw new Error(`ISSUE_18537_REPRODUCED: ${errorMessage(followUp.error)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
