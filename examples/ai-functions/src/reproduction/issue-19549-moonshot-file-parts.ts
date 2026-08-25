import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

const capturedRequests: Array<Record<string, unknown>> = [];

const moonshotai = createMoonshotAI({
  apiKey: 'test-api-key',
  fetch: async (_input, init) => {
    capturedRequests.push(JSON.parse(init?.body as string));

    return new Response(
      JSON.stringify({
        id: 'chatcmpl-issue-19549',
        object: 'chat.completion',
        created: 1787685033,
        model: 'kimi-k2.6',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'OK',
              reasoning_content: '',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  },
});

async function generateWithFile(file: {
  type: 'file';
  data:
    | { type: 'data'; data: Uint8Array }
    | { type: 'url'; url: URL }
    | { type: 'reference'; reference: Record<string, string> }
    | { type: 'text'; text: string };
  mediaType: string;
}) {
  const requestCountBefore = capturedRequests.length;

  await generateText({
    model: moonshotai('kimi-k2.6'),
    messages: [{ role: 'user', content: [file] }],
  });

  assert.equal(capturedRequests.length, requestCountBefore + 1);
  return capturedRequests.at(-1)!;
}

async function assertRejectedLocally(
  file: Parameters<typeof generateWithFile>[0],
) {
  const requestCountBefore = capturedRequests.length;
  await assert.rejects(() => generateWithFile(file));
  assert.equal(
    capturedRequests.length,
    requestCountBefore,
    'unsupported references must fail before an HTTP request is sent',
  );
}

async function main() {
  const primaryFailures: Array<string> = [];

  try {
    const request = await generateWithFile({
      type: 'file',
      data: { type: 'text', text: 'inline document text' },
      mediaType: 'text/plain',
    });
    assert.deepEqual(request.messages, [
      {
        role: 'user',
        content: [{ type: 'text', text: 'inline document text' }],
      },
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("'text file parts' functionality not supported")
    ) {
      primaryFailures.push('text file data');
    } else {
      throw error;
    }
  }

  for (const scenario of [
    {
      label: 'Moonshot image provider reference',
      mediaType: 'image/png',
      reference: 'ms://image-file-id',
      expected: {
        type: 'image_url',
        image_url: { url: 'ms://image-file-id' },
      },
    },
    {
      label: 'Moonshot video provider reference',
      mediaType: 'video/mp4',
      reference: 'ms://video-file-id',
      expected: {
        type: 'video_url',
        video_url: { url: 'ms://video-file-id' },
      },
    },
  ] as const) {
    try {
      const request = await generateWithFile({
        type: 'file',
        data: {
          type: 'reference',
          reference: { moonshotai: scenario.reference },
        },
        mediaType: scenario.mediaType,
      });
      assert.deepEqual(request.messages, [
        {
          role: 'user',
          content: [scenario.expected],
        },
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          "'file parts with provider references' functionality not supported",
        )
      ) {
        primaryFailures.push(scenario.label);
      } else {
        throw error;
      }
    }
  }

  const dataRequest = await generateWithFile({
    type: 'file',
    data: { type: 'data', data: new Uint8Array([0, 1, 2, 3]) },
    mediaType: 'image/png',
  });
  assert.deepEqual(dataRequest.messages, [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,AAECAw==' },
        },
      ],
    },
  ]);

  const urlRequest = await generateWithFile({
    type: 'file',
    data: { type: 'url', url: new URL('ms://existing-video-file-id') },
    mediaType: 'video/mp4',
  });
  assert.deepEqual(urlRequest.messages, [
    {
      role: 'user',
      content: [
        {
          type: 'video_url',
          video_url: { url: 'ms://existing-video-file-id' },
        },
      ],
    },
  ]);

  await assertRejectedLocally({
    type: 'file',
    data: {
      type: 'reference',
      reference: { openai: 'ms://foreign-file-id' },
    },
    mediaType: 'image/png',
  });
  await assertRejectedLocally({
    type: 'file',
    data: {
      type: 'reference',
      reference: { moonshotai: 'https://example.com/not-ms-reference' },
    },
    mediaType: 'image/png',
  });
  await assertRejectedLocally({
    type: 'file',
    data: {
      type: 'reference',
      reference: { moonshotai: 'ms://unsupported-file-id' },
    },
    mediaType: 'application/pdf',
  });

  if (primaryFailures.length > 0) {
    console.error(
      `ISSUE 19549 REPRODUCED: Moonshot rejects supported text/provider-reference file parts before request serialization (${primaryFailures.join(', ')})`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
