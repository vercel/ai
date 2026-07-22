import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateText, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const fixture = await readFile(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/issue-11363-stop-sequence-null.json',
      import.meta.url,
    ),
    'utf8',
  );

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    fetch: async () =>
      new Response(fixture, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  });

  const result = await generateText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    prompt: 'Use the weather tool for Seattle.',
    tools: {
      weather: tool({
        description: 'Get weather',
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    toolChoice: 'required',
    maxOutputTokens: 100,
  });

  assert.equal(result.finishReason, 'tool-calls');
  assert.equal(result.toolCalls[0]?.toolName, 'weather');
  assert.deepEqual(result.providerMetadata?.amazonBedrock?.stopSequence, null);

  console.log(
    'Issue #11363 could not be reproduced: stop_sequence: null was accepted and the tool call completed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
