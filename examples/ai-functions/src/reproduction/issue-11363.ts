import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BedrockChatLanguageModel } from '../../../../packages/amazon-bedrock/src/bedrock-chat-language-model';

function readFixture(filename: string) {
  return fs.readFileSync(
    path.resolve(
      process.cwd(),
      '../../packages/amazon-bedrock/src/__fixtures__',
      filename,
    ),
    'utf8',
  );
}

async function main() {
  const textFixture = readFixture(
    'issue-11363-stop-sequence-null-end-turn.json',
  );
  const toolFixture = readFixture(
    'issue-11363-stop-sequence-null-tool-use.json',
  );

  const model = new BedrockChatLanguageModel(
    'us.anthropic.claude-sonnet-4-20250514-v1:0',
    {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      generateId: () => 'test-id',
      fetch: async (_url, options) => {
        const request = JSON.parse(String(options?.body));
        return new Response(request.toolConfig ? toolFixture : textFixture, {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      },
    },
  );

  const prompt = [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'Hello' }],
    },
  ];

  const textResult = await model.doGenerate({
    prompt,
  });
  assert.deepEqual(textResult.content, [{ type: 'text', text: 'OK' }]);
  assert.equal(textResult.finishReason, 'stop');

  const toolResult = await model.doGenerate({
    prompt,
    tools: [
      {
        type: 'function',
        name: 'weather',
        description: 'Get weather',
        inputSchema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
          additionalProperties: false,
        },
      },
    ],
  });
  assert.equal(toolResult.finishReason, 'tool-calls');
  assert.deepEqual(toolResult.content, [
    {
      type: 'tool-call',
      toolCallId: 'tooluse_rTk04lpyTTTvtXcoOyVT6p',
      toolName: 'weather',
      input: '{"location":"Seattle"}',
    },
  ]);

  console.log(
    'Issue #11363 not reproduced: null stop_sequence preserved text and tool-call outcomes.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
