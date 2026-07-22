import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import fs from 'node:fs';
import { z } from 'zod';

const fixtureDirectory = '../../packages/amazon-bedrock/src/__fixtures__';

function readFixture(name: string) {
  const fixture = JSON.parse(
    fs.readFileSync(`${fixtureDirectory}/${name}.json`, 'utf8'),
  );

  if (fixture.additionalModelResponseFields?.stop_sequence !== null) {
    throw new Error('Fixture does not contain stop_sequence: null');
  }

  return fixture;
}

function createFixtureProvider(fixture: unknown) {
  return createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
}

async function main() {
  const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
  const textResult = await generateText({
    model: createFixtureProvider(
      readFixture('issue-11363-stop-sequence-null-end-turn'),
    )(modelId),
    prompt: 'Say hello.',
  });

  if (
    textResult.finishReason !== 'stop' ||
    textResult.text !== 'Hello! How can I help you today?'
  ) {
    throw new Error('Expected the regular text response to complete');
  }

  const toolResult = await generateText({
    model: createFixtureProvider(readFixture('issue-11363-stop-sequence-null'))(
      modelId,
    ),
    prompt: 'Use the querySalesforce tool to list account IDs.',
    tools: {
      querySalesforce: tool({
        description: 'Query Salesforce',
        inputSchema: z.object({ query: z.string() }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'querySalesforce' },
  });

  if (toolResult.finishReason !== 'tool-calls') {
    throw new Error(
      `Expected tool-calls finish reason, received ${toolResult.finishReason}`,
    );
  }

  if (
    toolResult.toolCalls.length !== 1 ||
    toolResult.toolCalls[0].toolName !== 'querySalesforce'
  ) {
    throw new Error('Expected the querySalesforce tool call to be preserved');
  }

  console.log(
    'Issue #11363 did not reproduce: null stop_sequence was accepted and the tool call completed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
