import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { SharedV3ProviderOptions } from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createVertex as createVertexWithoutAuth } from '../../../../packages/google-vertex/src/google-vertex-provider';

const prompt =
  'Generate a four-second landscape video of a red ball rolling across a white floor.';

const providerOptions: SharedV3ProviderOptions = {
  google: {
    responseModalities: ['video'],
    responseFormat: [
      {
        type: 'video',
        aspectRatio: '16:9',
        resolution: '360p',
      },
    ],
  },
};

type RequestBody = {
  response_format?: Array<Record<string, unknown>>;
  response_modalities?: Array<string>;
  stream?: boolean;
};

async function main() {
  const fixtureDirectory = path.resolve(
    process.cwd(),
    '../../packages/google/src/interactions/__fixtures__',
  );
  const [generateFixture, streamFixture] = await Promise.all([
    readFile(path.join(fixtureDirectory, 'video-response-format.json'), 'utf8'),
    readFile(
      path.join(fixtureDirectory, 'video-response-format.chunks.txt'),
      'utf8',
    ),
  ]);

  const createFixtureFetch = () => {
    let calls = 0;

    const fixtureFetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as RequestBody;

      assert.deepEqual(body.response_modalities, ['video']);
      assert.deepEqual(body.response_format, [
        {
          type: 'video',
          aspect_ratio: '16:9',
          resolution: '360p',
        },
      ]);

      return new Response(body.stream ? streamFixture : generateFixture, {
        headers: {
          'content-type': body.stream
            ? 'text/event-stream'
            : 'application/json',
        },
      });
    };

    return {
      fixtureFetch,
      get calls() {
        return calls;
      },
    };
  };

  const googleFetch = createFixtureFetch();
  const google = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: googleFetch.fixtureFetch,
  });

  const vertexFetch = createFixtureFetch();
  const vertex = createVertexWithoutAuth({
    project: 'test-project',
    location: 'us-central1',
    fetch: vertexFetch.fixtureFetch,
  });

  const models = [
    {
      name: '@ai-sdk/google',
      model: google.interactions('gemini-omni-1.1-flash'),
      getFetchCalls: () => googleFetch.calls,
    },
    {
      name: '@ai-sdk/google-vertex',
      model: vertex.interactions('gemini-omni-1.1-flash'),
      getFetchCalls: () => vertexFetch.calls,
    },
  ];

  const validationFailures: string[] = [];

  for (const { name, model, getFetchCalls } of models) {
    try {
      const result = await generateText({
        model,
        prompt,
        providerOptions,
      });
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].mediaType, 'video/mp4');
      assert.ok(result.files[0].uint8Array.length > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('invalid google provider options') &&
        getFetchCalls() === 0
      ) {
        validationFailures.push(`${name} generateText`);
      } else {
        throw error;
      }
    }

    const fetchCallsBeforeStream = getFetchCalls();
    try {
      const result = streamText({
        model,
        prompt,
        providerOptions,
        onError: () => {},
      });
      const parts = [];
      for await (const part of result.fullStream) {
        parts.push(part);
      }
      const errorPart = parts.find(part => part.type === 'error');
      const streamErrorMessage =
        errorPart?.type === 'error'
          ? errorPart.error instanceof Error
            ? errorPart.error.message
            : String(errorPart.error)
          : undefined;
      if (
        streamErrorMessage?.includes('invalid google provider options') &&
        getFetchCalls() === fetchCallsBeforeStream
      ) {
        validationFailures.push(`${name} streamText`);
        continue;
      }

      const fileParts = parts.filter(part => part.type === 'file');
      assert.equal(fileParts.length, 1);
      assert.equal(fileParts[0].file.mediaType, 'video/mp4');
      assert.ok(fileParts[0].file.uint8Array.length > 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('invalid google provider options') &&
        getFetchCalls() === fetchCallsBeforeStream
      ) {
        validationFailures.push(`${name} streamText`);
      } else {
        throw error;
      }
    }
  }

  if (validationFailures.length === 4) {
    console.error(
      'ISSUE #19945 REPRODUCED: video responseFormat prevented MP4 output in 4/4 AI SDK paths',
    );
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(validationFailures, []);
  console.log(
    'Video responseFormat reached both adapters and produced MP4 files for generateText and streamText.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
