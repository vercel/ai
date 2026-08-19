import 'dotenv/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

const FAILURE_SIGNAL =
  'ISSUE_18134_REPRODUCED: follow-up rejected because shell_call_output has no matching shell_call';

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${describeError(error.cause)}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function main() {
  let requestCount = 0;
  let firstResponseBody: unknown;
  let followUpRequest:
    | {
        body: JsonObject;
        headers: Headers;
        url: string;
      }
    | undefined;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

      requestCount += 1;

      if (requestCount === 2 && isJsonObject(body)) {
        followUpRequest = {
          body,
          headers: new Headers(init?.headers),
          url: String(input),
        };
      }

      const response = await fetch(input, init);

      if (requestCount === 1) {
        firstResponseBody = await response.clone().json();
      }

      return response;
    },
  });

  const shell = openai.tools.shell({
    environment: {
      type: 'containerAuto',
      memoryLimit: '1g',
      networkPolicy: { type: 'disabled' },
    },
  });

  const firstTurn = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: { shell },
    prompt: 'Run `printf issue-18134` using the shell tool.',
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });

  const followUp = streamText({
    model: openai.responses('gpt-5.2'),
    tools: { shell },
    messages: [
      {
        role: 'user',
        content: 'Run `printf issue-18134` using the shell tool.',
      },
      ...firstTurn.response.messages,
      { role: 'user', content: 'What did the command print?' },
    ],
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });

  let text = '';

  for await (const part of followUp.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    }

    if (part.type === 'error') {
      const details = describeError(part.error);

      if (
        details.includes(
          'No tool call found for shell call output with call_id',
        )
      ) {
        if (
          !isJsonObject(firstResponseBody) ||
          !Array.isArray(firstResponseBody.output) ||
          followUpRequest == null ||
          !Array.isArray(followUpRequest.body.input)
        ) {
          throw new Error(
            'Could not capture the OpenAI request/response pair.',
          );
        }

        const shellOutput = followUpRequest.body.input.find(
          item => isJsonObject(item) && item.type === 'shell_call_output',
        );

        if (
          !isJsonObject(shellOutput) ||
          typeof shellOutput.call_id !== 'string'
        ) {
          throw new Error('The follow-up did not contain a shell_call_output.');
        }

        const matchingShellCall = firstResponseBody.output.find(
          item =>
            isJsonObject(item) &&
            item.type === 'shell_call' &&
            item.call_id === shellOutput.call_id,
        );

        if (!isJsonObject(matchingShellCall)) {
          throw new Error('The first response did not contain the shell_call.');
        }

        const alreadyHasMatchingCall = followUpRequest.body.input.some(
          item =>
            isJsonObject(item) &&
            item.type === 'shell_call' &&
            item.call_id === shellOutput.call_id,
        );

        if (alreadyHasMatchingCall) {
          throw new Error(
            'The AI SDK follow-up already contained the matching shell_call.',
          );
        }

        const correctedInput = followUpRequest.body.input.flatMap(item =>
          item === shellOutput ? [matchingShellCall, item] : [item],
        );
        const correctedResponse = await fetch(followUpRequest.url, {
          method: 'POST',
          headers: followUpRequest.headers,
          body: JSON.stringify({
            ...followUpRequest.body,
            input: correctedInput,
            stream: false,
          }),
        });

        if (!correctedResponse.ok) {
          throw new Error(
            `Direct corrected OpenAI request failed: ${correctedResponse.status} ${await correctedResponse.text()}`,
          );
        }

        console.error(FAILURE_SIGNAL);
        process.exitCode = 1;
        return;
      }

      throw part.error;
    }
  }

  console.log(`Follow-up succeeded: ${text}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
