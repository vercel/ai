import { strict as assert } from 'node:assert';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';

const successMarker = 'issue-19674-deferred-tool-executed';

function createTools(onExecute: () => void) {
  return {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    get_issue_status: tool({
      description:
        'Get the authoritative reproduction status for a Vercel AI SDK issue.',
      inputSchema: z.object({
        issueNumber: z.number().describe('The GitHub issue number'),
      }),
      execute: async ({ issueNumber }) => {
        onExecute();
        return { issueNumber, status: successMarker };
      },
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
  };
}

function assertSuccessfulToolSearch(
  toolCalls: Array<{ toolName: string; invalid?: boolean }>,
  deferredToolExecuted: boolean,
  mode: string,
) {
  const searchCall = toolCalls.find(call => call.toolName === 'toolSearch');

  assert.ok(searchCall, `${mode}: Anthropic did not call the tool search tool`);
  assert.notEqual(
    searchCall.invalid,
    true,
    `${mode}: tool search was rejected as an invalid tool call`,
  );
  assert.ok(
    toolCalls.some(call => call.toolName === 'get_issue_status'),
    `${mode}: Anthropic did not call the discovered deferred tool`,
  );
  assert.ok(
    deferredToolExecuted,
    `${mode}: the discovered deferred tool was not executed`,
  );
}

async function reproduceGenerateText() {
  let deferredToolExecuted = false;
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt:
      'Use the available tools to retrieve the authoritative reproduction status for Vercel AI SDK issue 19674. Do not answer from memory.',
    tools: createTools(() => {
      deferredToolExecuted = true;
    }),
    stopWhen: isStepCount(5),
  });

  assertSuccessfulToolSearch(
    result.steps.flatMap(step => step.toolCalls),
    deferredToolExecuted,
    'generateText',
  );
}

async function reproduceStreamText() {
  let deferredToolExecuted = false;
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    prompt:
      'Use the available tools to retrieve the authoritative reproduction status for Vercel AI SDK issue 19674. Do not answer from memory.',
    tools: createTools(() => {
      deferredToolExecuted = true;
    }),
    stopWhen: isStepCount(5),
  });

  for await (const _ of result.fullStream) {
    // Consume the stream so provider and client tool execution complete.
  }

  const steps = await result.steps;
  assertSuccessfulToolSearch(
    steps.flatMap(step => step.toolCalls),
    deferredToolExecuted,
    'streamText',
  );
}

async function main() {
  await reproduceGenerateText();
  await reproduceStreamText();
  console.log(
    'Issue #19674 did not reproduce: generateText and streamText both completed provider tool search and executed the deferred tool.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
