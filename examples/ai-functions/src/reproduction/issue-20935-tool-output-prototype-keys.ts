import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  generateText,
  jsonSchema,
  streamText,
  tool,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const payloads = [
  ['__proto__', () => JSON.parse('{"rows":[{"__proto__":"x","name":"a"}]}')],
  [
    'constructor.prototype',
    () =>
      JSON.parse(
        '{"rows":[{"constructor":{"prototype":{"polluted":true}},"name":"a"}]}',
      ),
  ],
] as const;

function generateModel() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'lookup',
          input: '{}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage,
      warnings: [],
    },
  });
}

function streamModel() {
  return new MockLanguageModelV4({
    doStream: {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{}',
          });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
          });
          controller.close();
        },
      }),
    },
  });
}

function lookupTool(output: unknown) {
  return tool({
    inputSchema: jsonSchema({ type: 'object', properties: {} }),
    execute: async () => output,
  });
}

async function verifyGenerateText(output: unknown) {
  const result = await generateText({
    model: generateModel(),
    prompt: 'hi',
    tools: { lookup: lookupTool(output) },
  });

  assert.ok(result.responseMessages.length > 0);
}

async function verifyStreamText(output: unknown) {
  const result = streamText({
    model: streamModel(),
    prompt: 'hi',
    tools: { lookup: lookupTool(output) },
  });

  assert.ok((await result.responseMessages).length > 0);
}

async function verifyConvertToModelMessages(output: unknown) {
  const messages = await convertToModelMessages([
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-lookup',
          toolCallId: 'call-1',
          state: 'output-available',
          input: {},
          output,
        },
      ],
    },
  ]);

  assert.ok(messages.length > 0);
}

function isReportedError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === 'AI_JSONParseError' &&
    error.message.includes('Object contains forbidden prototype property')
  );
}

async function main() {
  const failures: string[] = [];

  for (const [payloadName, createPayload] of payloads) {
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(createPayload())));

    for (const [apiName, verify] of [
      ['generateText', verifyGenerateText],
      ['streamText', verifyStreamText],
      ['convertToModelMessages', verifyConvertToModelMessages],
    ] as const) {
      try {
        await verify(createPayload());
      } catch (error) {
        if (!isReportedError(error)) {
          throw error;
        }
        failures.push(`${apiName}:${payloadName}`);
      }
    }
  }

  if (failures.length > 0) {
    assert.deepEqual(failures, [
      'generateText:__proto__',
      'streamText:__proto__',
      'convertToModelMessages:__proto__',
      'generateText:constructor.prototype',
      'streamText:constructor.prototype',
      'convertToModelMessages:constructor.prototype',
    ]);

    throw new Error(
      'ISSUE_20935_REPRODUCED: generateText, streamText, and convertToModelMessages rejected valid JSON tool outputs with AI_JSONParseError',
    );
  }

  console.log(
    'Issue #20935 fixed: all valid JSON tool outputs completed successfully.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
