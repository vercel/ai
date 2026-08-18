import { createOpenAI, type OpenAIToolOptions } from '@ai-sdk/openai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  generateText,
  isStepCount,
  MissingToolResultsError,
  streamText,
  tool,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const fixtureBaseUrl = new URL(
  '../../../../packages/openai/src/responses/__fixtures__/',
  import.meta.url,
);

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

const hoursOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    member: { type: 'string' },
    hours: { type: 'number' },
  },
  required: ['member', 'hours'],
  additionalProperties: false,
};

function createDirectModel({
  includeFinalText,
}: {
  includeFinalText: boolean;
}) {
  const toolCallResponse = {
    content: [
      {
        type: 'tool-call' as const,
        toolCallId: 'direct-get-hours',
        toolName: 'getHours',
        input: '{"member":"Ada"}',
      },
    ],
    finishReason: { raw: undefined, unified: 'tool-calls' as const },
    usage,
    warnings: [],
  };

  return new MockLanguageModelV4({
    doGenerate: includeFinalText
      ? [
          toolCallResponse,
          {
            content: [{ type: 'text' as const, text: '40' }],
            finishReason: { raw: undefined, unified: 'stop' as const },
            usage,
            warnings: [],
          },
        ]
      : [toolCallResponse],
  });
}

function createTools(openai: ReturnType<typeof createOpenAI>) {
  return {
    program: openai.tools.programmaticToolCalling(),
    getHours: tool({
      description: 'Get recorded hours for one team member.',
      inputSchema: z.object({ member: z.string() }),
      execute: async ({ member }) => ({ member, hours: 40 }),
      providerOptions: {
        openai: {
          allowedCallers: ['programmatic'],
          outputSchema: hoursOutputSchema,
        } satisfies OpenAIToolOptions,
      },
    }),
  };
}

function createRecordedOpenAI({
  jsonResponses,
  streamChunks,
}: {
  jsonResponses?: string[];
  streamChunks?: string;
}) {
  let responseIndex = 0;

  return createOpenAI({
    apiKey: 'recorded-fixture',
    fetch: async (_url, init) => {
      const requestBody = JSON.parse(String(init?.body));

      if (requestBody.stream === true) {
        assert.ok(streamChunks != null, 'Missing recorded stream fixture.');
        const body =
          streamChunks
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => `data: ${line}\n\n`)
            .join('') + 'data: [DONE]\n\n';

        return new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      const responseBody = jsonResponses?.[responseIndex++];
      assert.ok(
        responseBody != null,
        'Missing recorded JSON fixture response.',
      );

      return new Response(responseBody, {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

function countApprovalRequests(
  content: ReadonlyArray<{ type: string }>,
): number {
  return content.filter(part => part.type === 'tool-approval-request').length;
}

async function verifyDirectControls() {
  const directWithoutApproval = await generateText({
    model: createDirectModel({ includeFinalText: true }),
    prompt: 'Get Ada hours.',
    stopWhen: isStepCount(3),
    tools: {
      getHours: tool({
        inputSchema: z.object({ member: z.string() }),
        execute: async ({ member }) => ({ member, hours: 40 }),
      }),
    },
  });

  assert.equal(directWithoutApproval.steps.length, 2);
  assert.equal(directWithoutApproval.text, '40');
  assert.equal(countApprovalRequests(directWithoutApproval.content), 0);

  const directWithApproval = await generateText({
    model: createDirectModel({ includeFinalText: false }),
    prompt: 'Get Ada hours.',
    stopWhen: isStepCount(3),
    tools: {
      getHours: tool({
        inputSchema: z.object({ member: z.string() }),
        execute: async ({ member }) => ({ member, hours: 40 }),
      }),
    },
    toolApproval: {
      getHours: 'user-approval',
    },
  });

  assert.equal(directWithApproval.steps.length, 1);
  assert.equal(countApprovalRequests(directWithApproval.content), 1);
  console.log('direct controls: passed');
}

async function verifyProgrammaticWithoutApproval(recordedJson: string) {
  const finalResponse = JSON.stringify({
    id: 'resp_program_complete',
    created_at: 1787088246,
    error: null,
    model: 'gpt-5.6-terra',
    output: [
      {
        id: 'program_output_1',
        type: 'program_output',
        call_id: 'call_YbiaUwdtG9jg12dor5Tw9gEY',
        result: '40',
        status: 'completed',
      },
      {
        id: 'message_1',
        type: 'message',
        role: 'assistant',
        phase: 'final_answer',
        content: [
          {
            type: 'output_text',
            text: '40',
            annotations: [],
            logprobs: [],
          },
        ],
      },
    ],
    service_tier: 'default',
    reasoning: { context: 'all_turns' },
    incomplete_details: null,
    usage: {
      input_tokens: 20,
      input_tokens_details: {
        cache_write_tokens: 0,
        cached_tokens: 0,
      },
      output_tokens: 5,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
    },
  });
  const openai = createRecordedOpenAI({
    jsonResponses: [recordedJson, finalResponse],
  });

  const result = await generateText({
    model: openai('gpt-5.6-terra'),
    prompt:
      'Use a hosted JavaScript program to call getHours exactly once for Ada.',
    stopWhen: isStepCount(5),
    tools: createTools(openai),
    providerOptions: {
      openai: { store: false },
    },
  });

  assert.equal(result.steps.length, 2);
  assert.equal(result.text, '40');
  assert.equal(countApprovalRequests(result.content), 0);
  console.log('programmatic without approval: passed');
}

async function checkGenerateApproval(recordedJson: string) {
  const openai = createRecordedOpenAI({ jsonResponses: [recordedJson] });

  try {
    const result = await generateText({
      model: openai('gpt-5.6-terra'),
      prompt:
        'Use a hosted JavaScript program to call getHours exactly once for Ada.',
      stopWhen: isStepCount(5),
      tools: createTools(openai),
      toolApproval: {
        getHours: 'user-approval',
      },
      providerOptions: {
        openai: { store: false },
      },
    });

    assert.equal(result.steps.length, 1);
    assert.equal(countApprovalRequests(result.content), 1);
    return false;
  } catch (error) {
    if (MissingToolResultsError.isInstance(error)) {
      console.log('generateText: produced AI_MissingToolResultsError');
      return true;
    }
    throw error;
  }
}

async function checkStreamApproval(recordedChunks: string) {
  const openai = createRecordedOpenAI({ streamChunks: recordedChunks });
  const result = streamText({
    model: openai('gpt-5.6-terra'),
    prompt:
      'Use a hosted JavaScript program to call getHours exactly once for Ada.',
    stopWhen: isStepCount(5),
    tools: createTools(openai),
    toolApproval: {
      getHours: 'user-approval',
    },
    providerOptions: {
      openai: { store: false },
    },
  });

  let approvalRequests = 0;
  let missingToolResultsErrors = 0;

  for await (const part of result.fullStream) {
    if (part.type === 'tool-approval-request') {
      approvalRequests++;
    } else if (
      part.type === 'error' &&
      MissingToolResultsError.isInstance(part.error)
    ) {
      missingToolResultsErrors++;
    }
  }

  if (missingToolResultsErrors > 0) {
    console.log('streamText: produced AI_MissingToolResultsError');
    return true;
  }

  assert.equal(approvalRequests, 1);
  return false;
}

async function main() {
  const [recordedJson, recordedChunks] = await Promise.all([
    readFile(
      new URL('issue-18970-programmatic-approval.1.json', fixtureBaseUrl),
      'utf8',
    ),
    readFile(
      new URL('issue-18970-programmatic-approval.1.chunks.txt', fixtureBaseUrl),
      'utf8',
    ),
  ]);

  await verifyDirectControls();
  await verifyProgrammaticWithoutApproval(recordedJson);

  const [generateFailed, streamFailed] = await Promise.all([
    checkGenerateApproval(recordedJson),
    checkStreamApproval(recordedChunks),
  ]);

  if (generateFailed && streamFailed) {
    throw new Error(
      'ISSUE_18970_REPRODUCED: pending programmatic tool call suppresses the approval halt in generateText and streamText',
    );
  }

  assert.equal(generateFailed, false);
  assert.equal(streamFailed, false);
  console.log('programmatic approval: halted correctly');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
