import { createAnthropic } from '@ai-sdk/anthropic';
import { parseJSON } from '@ai-sdk/provider-utils';
import {
  APICallError,
  generateText,
  isStepCount,
  tool,
  TypeValidationError,
  type ModelMessage,
} from 'ai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const orphanedToolUseMessage =
  '`tool_search_tool_regex` tool use with id `srvtoolu_018yKDHFpyBNErTrzqbP8etq` was found without a corresponding `tool_search_tool_result` block';

const successResponse = {
  model: 'claude-sonnet-5-5',
  id: 'msg_replay_succeeded',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'The failed tool search was preserved in the conversation.',
    },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 1,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: {
      ephemeral_5m_input_tokens: 0,
      ephemeral_1h_input_tokens: 0,
    },
    output_tokens: 1,
    service_tier: 'standard',
    inference_geo: 'not_available',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function hasToolSearchErrorResult(body: unknown): boolean {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return false;
  }

  return body.messages.some(message => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return false;
    }

    return message.content.some(part => {
      if (
        !isRecord(part) ||
        part.type !== 'tool_search_tool_result' ||
        !isRecord(part.content)
      ) {
        return false;
      }

      return part.content.type === 'tool_search_tool_result_error';
    });
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function requestBody(init: RequestInit | undefined): Promise<unknown> {
  if (typeof init?.body !== 'string') {
    throw new Error('Reproduction setup failed: expected a JSON request body.');
  }

  return parseJSON({ text: init.body });
}

function createReplayFetch(recordedResponses: unknown[]) {
  let responseIndex = 0;

  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = await requestBody(init);

    if (responseIndex < recordedResponses.length) {
      return jsonResponse(recordedResponses[responseIndex++]);
    }

    if (hasToolSearchErrorResult(body)) {
      return jsonResponse(successResponse);
    }

    return jsonResponse(
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: orphanedToolUseMessage,
        },
        request_id: 'req_issue_22432',
      },
      400,
    );
  };
}

function combineRecordedResponses(
  step1Response: unknown,
  step2Response: unknown,
): unknown {
  if (
    !isRecord(step1Response) ||
    !Array.isArray(step1Response.content) ||
    step1Response.content.length < 2 ||
    !isRecord(step2Response) ||
    !Array.isArray(step2Response.content) ||
    step2Response.content.length < 1
  ) {
    throw new Error(
      'Reproduction setup failed: recorded responses have an unexpected shape.',
    );
  }

  return {
    ...step1Response,
    content: [
      step1Response.content[0],
      step2Response.content[0],
      step1Response.content[1],
    ],
  };
}

function isExpectedReplayFailure(error: unknown): boolean {
  return (
    (APICallError.isInstance(error) &&
      error.message.includes(orphanedToolUseMessage)) ||
    (TypeValidationError.isInstance(error) &&
      error.message.includes('expected array, received object'))
  );
}

async function loadFixture(filename: string): Promise<unknown> {
  const text = await readFile(
    new URL(
      `../../../../packages/anthropic/src/__fixtures__/${filename}`,
      import.meta.url,
    ),
    'utf8',
  );
  return parseJSON({ text });
}

async function main() {
  globalThis.AI_SDK_LOG_WARNINGS = false;

  const [step1Response, step2Response] = await Promise.all([
    loadFixture('anthropic-tool-search-error-step-1.1.json'),
    loadFixture('anthropic-tool-search-error-step-2.1.json'),
  ]);

  const prompt =
    'Make an invalid regex tool search, and also call continue_tool so another model step runs.';
  const tools = {
    toolSearch: createAnthropic().tools.toolSearchRegex_20251119(),
    deferred_tool: tool({
      description: 'A deferred tool',
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
      providerOptions: { anthropic: { deferLoading: true } },
    }),
    continue_tool: tool({
      description: 'Continue to another model step',
      inputSchema: z.object({}),
      execute: async () => ({ continued: true }),
    }),
  };

  const recordedProvider = createAnthropic({
    apiKey: 'recorded-fixture',
    fetch: createReplayFetch([step1Response, step2Response]),
  });

  const replayFailures: string[] = [];
  const combinedProvider = createAnthropic({
    apiKey: 'recorded-fixture',
    fetch: createReplayFetch([
      combineRecordedResponses(step1Response, step2Response),
    ]),
  });

  try {
    await generateText({
      model: combinedProvider('claude-sonnet-5-5'),
      prompt,
      tools,
      stopWhen: isStepCount(2),
    });
  } catch (error) {
    if (!isExpectedReplayFailure(error)) {
      throw error;
    }
    replayFailures.push('generateText error-json next step');
  }

  const initialResult = await generateText({
    model: recordedProvider('claude-sonnet-5-5'),
    prompt,
    tools,
    stopWhen: isStepCount(2),
  });

  const fullHistory: ModelMessage[] = [
    { role: 'user', content: prompt },
    ...initialResult.steps.flatMap(step => step.response.messages),
    { role: 'user', content: 'Confirm that the prior search failed.' },
  ];

  try {
    await generateText({
      model: recordedProvider('claude-sonnet-5-5'),
      messages: fullHistory,
      tools,
    });
  } catch (error) {
    if (!isExpectedReplayFailure(error)) {
      throw error;
    }
    replayFailures.push('generateText error-json later turn');
  }

  const persistedJsonHistory = [
    {
      role: 'user',
      content: 'Make an invalid regex tool search.',
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'srvtoolu_persisted_22432',
          toolName: 'toolSearch',
          input: { pattern: '[' },
          providerExecuted: true,
        },
      ],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'srvtoolu_persisted_22432',
          toolName: 'toolSearch',
          output: {
            type: 'json',
            value: {
              type: 'tool_search_tool_result_error',
              errorCode: 'invalid_tool_input',
            },
          },
        },
      ],
    },
    {
      role: 'user',
      content: 'Confirm that the prior search failed.',
    },
  ] satisfies ModelMessage[];

  const persistedProvider = createAnthropic({
    apiKey: 'recorded-fixture',
    fetch: createReplayFetch([]),
  });

  try {
    await generateText({
      model: persistedProvider('claude-sonnet-5-5'),
      messages: persistedJsonHistory,
      tools,
    });
  } catch (error) {
    if (!isExpectedReplayFailure(error)) {
      throw error;
    }
    replayFailures.push('persisted json error history');
  }

  if (replayFailures.length > 0) {
    console.error(
      'ISSUE 22432 REPRODUCED: failed tool-search errors cannot be replayed in later Anthropic requests',
    );
    console.error(`Failing paths: ${replayFailures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Reproduction harness failed unexpectedly:', error);
  process.exitCode = 2;
});
