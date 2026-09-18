import assert from 'node:assert/strict';
import { generateText, streamText } from 'ai';
import {
  convertArrayToReadableStream,
  MockLanguageModelV3,
  MockLanguageModelV4,
} from 'ai/test';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const finishReason = { unified: 'stop' as const, raw: 'stop' };
const fileBytes = new Uint8Array([37, 80, 68, 70]);
const generatedBytes = new Uint8Array([1, 2, 3]);
const generatedBase64 = 'AQID';
const fileUrl = new URL('https://example.com/document.pdf');
const supportedUrls = {
  'application/pdf': [/^https:\/\/example\.com\//],
};

type CheckResult = {
  name: string;
  error?: unknown;
};

async function runCheck(
  name: string,
  check: () => Promise<void>,
): Promise<CheckResult> {
  try {
    await check();
    console.log(`PASS ${name}`);
    return { name };
  } catch (error) {
    console.log(
      `FAIL ${name}: ${
        error instanceof Error ? `${error.name}: ${error.message}` : error
      }`,
    );
    return { name, error };
  }
}

function getOnlyFileData(
  prompt: Array<{
    role: string;
    content:
      | string
      | Array<{
          type: string;
          data?: unknown;
        }>;
  }>,
): unknown {
  for (const message of prompt) {
    if (!Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part.type === 'file') {
        return part.data;
      }
    }
  }

  assert.fail('The model did not receive a file part.');
}

function assertBytes(actual: Uint8Array, expected: Uint8Array): void {
  assert.deepEqual([...actual], [...expected]);
}

async function checkV3GenerateInput(data: Uint8Array | URL): Promise<void> {
  const model = new MockLanguageModelV3({
    supportedUrls,
    doGenerate: {
      content: [{ type: 'text', text: 'Synthetic response.' }],
      finishReason,
      usage,
      warnings: [],
    },
  });

  await generateText({
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data }],
      },
    ],
    maxRetries: 0,
  });

  const receivedData = getOnlyFileData(model.doGenerateCalls[0].prompt);
  if (data instanceof URL) {
    assert.ok(receivedData instanceof URL);
    assert.equal(receivedData.toString(), data.toString());
  } else {
    assert.ok(receivedData instanceof Uint8Array);
    assertBytes(receivedData, data);
  }
}

async function checkV3StreamInput(data: Uint8Array | URL): Promise<void> {
  const model = new MockLanguageModelV3({
    supportedUrls,
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data }],
      },
    ],
    maxRetries: 0,
  });
  await result.text;

  const receivedData = getOnlyFileData(model.doStreamCalls[0].prompt);
  if (data instanceof URL) {
    assert.ok(receivedData instanceof URL);
    assert.equal(receivedData.toString(), data.toString());
  } else {
    assert.ok(receivedData instanceof Uint8Array);
    assertBytes(receivedData, data);
  }
}

async function checkV3GenerateOutput(data: Uint8Array | string): Promise<void> {
  const model = new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'file', mediaType: 'image/png', data }],
      finishReason,
      usage,
      warnings: [],
    },
  });

  const result = await generateText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });

  assert.equal(result.files.length, 1);
  assertBytes(result.files[0].uint8Array, generatedBytes);
}

async function checkV3StreamOutput(data: Uint8Array | string): Promise<void> {
  const model = new MockLanguageModelV3({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'file', mediaType: 'image/png', data },
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  const files = await result.files;

  assert.equal(files.length, 1);
  assertBytes(files[0].uint8Array, generatedBytes);
}

async function checkV4GenerateInput(data: Uint8Array | URL): Promise<void> {
  const model = new MockLanguageModelV4({
    supportedUrls,
    doGenerate: {
      content: [{ type: 'text', text: 'Synthetic response.' }],
      finishReason,
      usage,
      warnings: [],
    },
  });

  await generateText({
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data }],
      },
    ],
    maxRetries: 0,
  });

  const receivedData = getOnlyFileData(model.doGenerateCalls[0].prompt);
  assert.deepEqual(
    receivedData,
    data instanceof URL ? { type: 'url', url: data } : { type: 'data', data },
  );
}

async function checkV4StreamInput(data: Uint8Array | URL): Promise<void> {
  const model = new MockLanguageModelV4({
    supportedUrls,
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    messages: [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', data }],
      },
    ],
    maxRetries: 0,
  });
  await result.text;

  const receivedData = getOnlyFileData(model.doStreamCalls[0].prompt);
  assert.deepEqual(
    receivedData,
    data instanceof URL ? { type: 'url', url: data } : { type: 'data', data },
  );
}

async function checkV4GenerateOutput(data: Uint8Array | string): Promise<void> {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data },
        },
      ],
      finishReason,
      usage,
      warnings: [],
    },
  });

  const result = await generateText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });

  assert.equal(result.files.length, 1);
  assertBytes(result.files[0].uint8Array, generatedBytes);
}

async function checkV4StreamOutput(data: Uint8Array | string): Promise<void> {
  const model = new MockLanguageModelV4({
    doStream: {
      stream: convertArrayToReadableStream([
        {
          type: 'file',
          mediaType: 'image/png',
          data: { type: 'data', data },
        },
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  const files = await result.files;

  assert.equal(files.length, 1);
  assertBytes(files[0].uint8Array, generatedBytes);
}

async function checkV3GenerateTextControl(): Promise<void> {
  const model = new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text: 'Synthetic response.' }],
      finishReason,
      usage,
      warnings: [],
    },
  });

  const result = await generateText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  assert.equal(result.text, 'Synthetic response.');
}

async function checkV3StreamTextControl(): Promise<void> {
  const model = new MockLanguageModelV3({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Synthetic response.' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  assert.equal(await result.text, 'Synthetic response.');
}

async function checkV4GenerateTextControl(): Promise<void> {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'Synthetic response.' }],
      finishReason,
      usage,
      warnings: [],
    },
  });

  const result = await generateText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  assert.equal(result.text, 'Synthetic response.');
}

async function checkV4StreamTextControl(): Promise<void> {
  const model = new MockLanguageModelV4({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Synthetic response.' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason, usage },
      ]),
    },
  });

  const result = streamText({
    model,
    prompt: 'Synthetic prompt.',
    maxRetries: 0,
  });
  assert.equal(await result.text, 'Synthetic response.');
}

async function main(): Promise<void> {
  const controlChecks = [
    ['v3 generateText text control', checkV3GenerateTextControl],
    ['v3 streamText text control', checkV3StreamTextControl],
    [
      'v4 generateText byte input control',
      () => checkV4GenerateInput(fileBytes),
    ],
    ['v4 generateText URL input control', () => checkV4GenerateInput(fileUrl)],
    ['v4 streamText byte input control', () => checkV4StreamInput(fileBytes)],
    ['v4 streamText URL input control', () => checkV4StreamInput(fileUrl)],
    [
      'v4 generateText byte output control',
      () => checkV4GenerateOutput(generatedBytes),
    ],
    [
      'v4 generateText base64 output control',
      () => checkV4GenerateOutput(generatedBase64),
    ],
    [
      'v4 streamText byte output control',
      () => checkV4StreamOutput(generatedBytes),
    ],
    [
      'v4 streamText base64 output control',
      () => checkV4StreamOutput(generatedBase64),
    ],
    ['v4 generateText text control', checkV4GenerateTextControl],
    ['v4 streamText text control', checkV4StreamTextControl],
  ] satisfies Array<[string, () => Promise<void>]>;

  const controlResults: CheckResult[] = [];
  for (const [name, check] of controlChecks) {
    controlResults.push(await runCheck(name, check));
  }

  const controlFailures = controlResults.filter(result => result.error != null);
  if (controlFailures.length > 0) {
    console.error(
      `CONTROL FAILURE: ${controlFailures.length}/${controlChecks.length} non-v3-file checks failed`,
    );
    process.exitCode = 2;
    return;
  }

  const issueChecks = [
    ['v3 generateText byte input', () => checkV3GenerateInput(fileBytes)],
    ['v3 generateText URL input', () => checkV3GenerateInput(fileUrl)],
    ['v3 streamText byte input', () => checkV3StreamInput(fileBytes)],
    ['v3 streamText URL input', () => checkV3StreamInput(fileUrl)],
    [
      'v3 generateText byte output',
      () => checkV3GenerateOutput(generatedBytes),
    ],
    [
      'v3 generateText base64 output',
      () => checkV3GenerateOutput(generatedBase64),
    ],
    ['v3 streamText byte output', () => checkV3StreamOutput(generatedBytes)],
    ['v3 streamText base64 output', () => checkV3StreamOutput(generatedBase64)],
  ] satisfies Array<[string, () => Promise<void>]>;

  const issueResults: CheckResult[] = [];
  for (const [name, check] of issueChecks) {
    issueResults.push(await runCheck(name, check));
  }

  const issueFailures = issueResults.filter(result => result.error != null);
  if (issueFailures.length > 0) {
    console.error(
      `ISSUE #21047 REPRODUCED: ${issueFailures.length}/${issueChecks.length} v3 file compatibility checks failed`,
    );
    process.exitCode = 1;
  } else {
    console.log('ISSUE #21047 NOT REPRODUCED: all v3 file checks passed');
  }
}

await main();
