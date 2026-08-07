import { createOpenAI } from '@ai-sdk/openai';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';

const failureSignal =
  'No tool call found for function call output with call_id';

const requestBodies: unknown[] = [];
const errorResponses: Array<{ status: number; body: string }> = [];
let latestRequest:
  | {
      url: string;
      headers: Headers;
    }
  | undefined;

const openai = createOpenAI({
  fetch: async (input, init) => {
    latestRequest = {
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      headers: new Headers(init?.headers),
    };

    if (typeof init?.body === 'string') {
      requestBodies.push(JSON.parse(init.body));
    }

    const response = await fetch(input, init);

    if (!response.ok) {
      errorResponses.push({
        status: response.status,
        body: await response.clone().text(),
      });
    }

    return response;
  },
});

const search = tool({
  description: 'Search for products matching a query.',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: `results for ${query}` }),
});

async function runTurn({
  prompt,
  previousResponseId,
}: {
  prompt: string;
  previousResponseId?: string;
}) {
  const errors: unknown[] = [];
  let toolCallCount = 0;
  let toolCall:
    | {
        input: unknown;
        toolCallId: string;
        toolName: string;
      }
    | undefined;

  const result = streamText({
    model: openai.responses('gpt-4.1-mini'),
    prompt,
    tools: { search },
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: { type: 'tool', toolName: 'search' } }
        : { activeTools: [] },
    providerOptions: {
      openai: {
        store: true,
        ...(previousResponseId != null && { previousResponseId }),
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      toolCallCount++;
      toolCall = {
        input: part.input,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      };
    } else if (part.type === 'error') {
      errors.push(part.error);
    }
  }

  return {
    errors,
    toolCall,
    toolCallCount,
    responseId: (await result.finalStep).providerMetadata?.openai?.responseId as
      | string
      | undefined,
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return JSON.stringify(error);
}

async function main() {
  const firstTurn = await runTurn({ prompt: 'Search for red shoes.' });

  if (firstTurn.errors.length > 0) {
    throw new Error(
      `Turn 1 unexpectedly failed: ${firstTurn.errors.map(errorText).join('; ')}`,
    );
  }
  if (firstTurn.toolCallCount !== 1 || firstTurn.responseId == null) {
    throw new Error(
      `Turn 1 did not complete the expected tool call: ${JSON.stringify(firstTurn)}`,
    );
  }

  const secondTurn = await runTurn({
    prompt: 'Now search for blue shoes.',
    previousResponseId: firstTurn.responseId,
  });

  const providerError = errorResponses.find(({ body }) =>
    body.includes(failureSignal),
  );
  const streamError = secondTurn.errors.find(error =>
    errorText(error).includes(failureSignal),
  );

  if (providerError != null && streamError != null) {
    const failedRequest = requestBodies.at(-1) as
      | {
          input?: Array<{ type?: string }>;
          [key: string]: unknown;
        }
      | undefined;
    const inputTypes = failedRequest?.input?.map(item => item.type);

    if (
      failedRequest?.input == null ||
      secondTurn.toolCall == null ||
      latestRequest == null
    ) {
      throw new Error('Could not reconstruct the failed provider request.');
    }

    const outputIndex = failedRequest.input.findIndex(
      item => item.type === 'function_call_output',
    );
    const correctedInput = [...failedRequest.input];
    correctedInput.splice(outputIndex, 0, {
      type: 'function_call',
      call_id: secondTurn.toolCall.toolCallId,
      name: secondTurn.toolCall.toolName,
      arguments:
        typeof secondTurn.toolCall.input === 'string'
          ? secondTurn.toolCall.input
          : JSON.stringify(secondTurn.toolCall.input),
    });

    const correctedResponse = await fetch(latestRequest.url, {
      method: 'POST',
      headers: latestRequest.headers,
      body: JSON.stringify({
        ...failedRequest,
        input: correctedInput,
        stream: false,
      }),
    });

    if (!correctedResponse.ok) {
      throw new Error(
        `Direct provider comparison failed (${correctedResponse.status}): ${await correctedResponse.text()}`,
      );
    }

    console.error(
      `ISSUE_18537_REPRODUCED: ${failureSignal}; failed request input types: ${JSON.stringify(inputTypes)}; direct corrected status: ${correctedResponse.status}`,
    );
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `Issue #18537 was not reproduced. Turn 2: ${JSON.stringify({
      toolCallCount: secondTurn.toolCallCount,
      errors: secondTurn.errors.map(errorText),
      errorResponses,
    })}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
