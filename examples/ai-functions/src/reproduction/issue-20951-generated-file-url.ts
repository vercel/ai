// Deterministic public-API integration reproduction; no live provider calls.
import type { LanguageModelV4File } from '@ai-sdk/provider';
import {
  generateText,
  simulateReadableStream,
  streamText,
  ToolLoopAgent,
  type GeneratedFile,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mock } from 'node:test';
import { pathToFileURL } from 'node:url';
import type * as Undici from 'undici';

const sourceUrl = 'https://example.com/generated.png';
// A real 1x1 PNG so the resulting data URL can also be rendered.
const expectedBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';
const expectedBytes = Buffer.from(expectedBase64, 'base64');
const expectedDataUrl = `data:image/png;base64,${expectedBase64}`;
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

// Only these specific symptoms count as reproducing the reported bug.
// Transport failures and unrelated assertion failures are harness errors.
class ReproducedBugError extends Error {}

function createModel(data: LanguageModelV4File['data']) {
  const file: LanguageModelV4File = {
    type: 'file',
    mediaType: 'image/png',
    data,
  };
  return new MockLanguageModelV4({
    doGenerate: {
      content: [file],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          file,
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ],
      }),
    }),
  });
}

function assertGeneratedFile(file: GeneratedFile | undefined, label: string) {
  assert.ok(file, `${label}: missing generated file`);
  if (file.base64 === sourceUrl) {
    throw new ReproducedBugError(
      `${label}: file.base64 contains the source URL`,
    );
  }
  assert.equal(file.base64, expectedBase64, `${label}: incorrect base64`);
  assert.deepEqual(
    Buffer.from(file.uint8Array),
    expectedBytes,
    `${label}: incorrect bytes`,
  );
}

async function assertUIFileUrl(
  stream: AsyncIterable<{ type: string; url?: string; errorText?: string }>,
  label: string,
) {
  let foundFile = false;
  for await (const part of stream) {
    if (part.type === 'error') {
      throw new Error(`${label}: stream failed: ${part.errorText}`);
    }
    if (part.type !== 'file') continue;
    if (part.url === `data:image/png;base64,${sourceUrl}`) {
      throw new ReproducedBugError(
        `${label}: UI file URL embeds the source URL as base64`,
      );
    }
    assert.ok(
      part.url === sourceUrl || part.url === expectedDataUrl,
      `${label}: unexpected UI file URL: ${part.url}`,
    );
    foundFile = true;
  }
  assert.ok(foundFile, `${label}: missing UI file part`);
}

async function checkOutputs(data: LanguageModelV4File['data'], label: string) {
  const failures: string[] = [];
  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      if (!(error instanceof ReproducedBugError)) throw error;
      failures.push(`${label} ${name}: ${error.message}`);
    }
  };
  const model = createModel(data);
  const agent = new ToolLoopAgent({ model });
  const prompt = 'Return an image.';

  await check('generateText', async () => {
    const result = await generateText({ model, prompt });
    assertGeneratedFile(result.files[0], 'generateText');
  });
  await check('streamText files', async () => {
    const result = streamText({ model, prompt });
    assertGeneratedFile((await result.files)[0], 'streamText');
  });
  await check('streamText UI', async () => {
    const result = streamText({ model, prompt });
    await assertUIFileUrl(result.toUIMessageStream(), 'streamText');
  });
  await check('ToolLoopAgent.generate', async () => {
    const result = await agent.generate({ prompt });
    assertGeneratedFile(result.files[0], 'ToolLoopAgent.generate');
  });
  await check('ToolLoopAgent.stream files', async () => {
    const result = await agent.stream({ prompt });
    assertGeneratedFile((await result.files)[0], 'ToolLoopAgent.stream');
  });
  await check('ToolLoopAgent.stream UI', async () => {
    const result = await agent.stream({ prompt });
    await assertUIFileUrl(result.toUIMessageStream(), 'ToolLoopAgent.stream');
  });
  return failures;
}

async function main() {
  // Node's protected downloader uses Undici directly and intentionally ignores
  // global fetch replacements. Intercept its transport only in this fixture,
  // as tools/setup-download-fetch.node.js does for the SDK's fixture tests.
  // Resolve from provider-utils: the example may use a different Undici version.
  const undiciPath = createRequire(
    import.meta.resolve('@ai-sdk/provider-utils/package.json'),
  ).resolve('undici');
  const { default: undici } = (await import(
    pathToFileURL(undiciPath).href
  )) as {
    default: typeof Undici;
  };
  const fetchMock = mock.method(
    undici,
    'fetch',
    async (input: Parameters<typeof undici.fetch>[0]) => {
      const url =
        typeof input === 'string'
          ? input
          : 'url' in input
            ? input.url
            : input.href;
      assert.equal(url, sourceUrl, `Unexpected fixture request: ${url}`);
      return new undici.Response(expectedBytes, {
        headers: { 'content-type': 'image/png' },
      });
    },
  );

  try {
    for (const data of [expectedBase64, expectedBytes]) {
      assert.deepEqual(
        await checkOutputs({ type: 'data', data }, 'inline control'),
        [],
      );
    }
    const failures = await checkOutputs(
      { type: 'url', url: new URL(sourceUrl) },
      'URL',
    );
    if (failures.length > 0) {
      console.error(
        'ISSUE_20951: generated file URL outputs are not usable\n' +
          failures.map(failure => `- ${failure}`).join('\n'),
      );
      process.exitCode = 1;
      return;
    }
    console.log('Issue #20951 did not reproduce.');
  } finally {
    fetchMock.mock.restore();
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
