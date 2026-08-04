import { createAnthropic } from '@ai-sdk/anthropic';
import {
  InvalidResponseDataError,
  type LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { streamText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const fixtureDirectory = new URL(
  '../../../../packages/anthropic/src/__fixtures__/',
  import.meta.url,
);

function readFixture(name: string) {
  return fs
    .readFileSync(new URL(`${name}.chunks.txt`, fixtureDirectory), 'utf8')
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`)
    .join('');
}

function createFixtureModel(fixtureName: string) {
  const body = readFixture(fixtureName);

  return createAnthropic({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  })('claude-3-haiku-20240307');
}

async function collectStream(
  fixtureName: string,
  withTool = false,
): Promise<LanguageModelV4StreamPart[]> {
  const model = createFixtureModel(fixtureName);

  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Call the test tool.' }],
      },
    ],
    tools: withTool
      ? [
          {
            type: 'function',
            name: 'test-tool',
            inputSchema: {
              type: 'object',
              properties: { value: { type: 'string' } },
              required: ['value'],
              additionalProperties: false,
            },
          },
        ]
      : undefined,
  });

  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  return parts;
}

async function main() {
  const splicedParts = await collectStream(
    'issue-18331-spliced-generations',
    true,
  );
  const duplicateParts = await collectStream(
    'issue-18331-duplicate-message-start',
  );
  const mergedResult = streamText({
    model: createFixtureModel('issue-18331-spliced-generations'),
    prompt: 'Call the test tool.',
    tools: {
      'test-tool': tool({
        inputSchema: z.object({ value: z.string() }),
      }),
    },
  });
  const mergedSteps = await mergedResult.steps;
  const recordedContent =
    mergedSteps[0]?.content.map(part => {
      switch (part.type) {
        case 'reasoning':
          return {
            type: part.type,
            text: part.text,
            signature: part.providerMetadata?.anthropic?.signature,
          };
        case 'tool-call':
          return {
            type: part.type,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          };
        default:
          return { type: part.type };
      }
    }) ?? [];

  const splicedErrors = splicedParts.filter(part => part.type === 'error');
  const invalidResponseErrors = splicedErrors.filter(
    part =>
      part.type === 'error' && InvalidResponseDataError.isInstance(part.error),
  );
  const responseIds = splicedParts
    .filter(part => part.type === 'response-metadata')
    .map(part => part.id);
  const reasoningStarts = splicedParts.filter(
    part => part.type === 'reasoning-start',
  ).length;
  const toolCallIds = splicedParts
    .filter(part => part.type === 'tool-call')
    .map(part => part.toolCallId);
  const hasFinish = splicedParts.some(part => part.type === 'finish');
  const duplicateMetadataCount = duplicateParts.filter(
    part => part.type === 'response-metadata',
  ).length;

  const output = {
    splicedStream: {
      responseIds,
      reasoningStarts,
      toolCallIds,
      errorCount: splicedErrors.length,
      invalidResponseErrorCount: invalidResponseErrors.length,
      hasFinish,
    },
    streamTextHistory: {
      stepCount: mergedSteps.length,
      recordedContent,
    },
    sameIdDuplicate: {
      responseMetadataCount: duplicateMetadataCount,
      expectedResponseMetadataCount: 1,
    },
  };

  console.log(JSON.stringify(output, null, 2));

  const silentlyMerged =
    invalidResponseErrors.length === 0 &&
    responseIds.includes('msg_first') &&
    responseIds.includes('msg_second') &&
    reasoningStarts === 2 &&
    toolCallIds.includes('toolu_second') &&
    hasFinish &&
    mergedSteps.length === 1 &&
    recordedContent.filter(part => part.type === 'reasoning').length === 2 &&
    recordedContent.some(
      part => part.type === 'tool-call' && part.toolCallId === 'toolu_second',
    );

  if (silentlyMerged) {
    throw new Error(
      'ISSUE #18331 REPRODUCED: a different message_start was silently merged into the open Anthropic generation.',
    );
  }

  if (invalidResponseErrors.length !== 1) {
    throw new Error(
      'Expected one InvalidResponseDataError for the spliced Anthropic stream.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
