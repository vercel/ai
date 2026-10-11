import assert from 'node:assert/strict';
import { createDeepgram } from '@ai-sdk/deepgram';
import { generateSpeech } from 'ai';

const callbackAcknowledgement = {
  request_id: 'synthetic-request-id',
};

async function main() {
  const requestUrls: string[] = [];
  const provider = createDeepgram({
    apiKey: 'synthetic',
    fetch: async input => {
      const url = input.toString();
      requestUrls.push(url);

      if (new URL(url).searchParams.has('callback')) {
        return Response.json(callbackAcknowledgement);
      }

      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), {
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });

  const control = await generateSpeech({
    model: provider.speech('aura-2-thalia-en'),
    text: 'Hello',
    maxRetries: 0,
  });
  assert.equal(control.audio.mediaType, 'audio/mpeg');

  let result: Awaited<ReturnType<typeof generateSpeech>> | undefined;
  let error: unknown;

  try {
    result = await generateSpeech({
      model: provider.speech('aura-2-thalia-en'),
      text: 'Hello',
      maxRetries: 0,
      providerOptions: {
        deepgram: {
          callback: 'https://synthetic.invalid/callback',
        },
      },
    });
  } catch (caughtError) {
    error = caughtError;
  }

  console.log(
    JSON.stringify({
      requests: requestUrls.length,
      callback: requestUrls.at(-1)
        ? new URL(requestUrls.at(-1)!).searchParams.get('callback')
        : null,
      error: error instanceof Error ? error.message : undefined,
      mediaType: result?.audio.mediaType,
      audioText:
        result == null
          ? undefined
          : new TextDecoder().decode(result.audio.uint8Array),
    }),
  );

  if (result != null) {
    assert.equal(result.audio.mediaType, 'audio/mp3');
    assert.deepEqual(
      JSON.parse(new TextDecoder().decode(result.audio.uint8Array)),
      callbackAcknowledgement,
    );
    throw new Error(
      'REPRODUCED: Deepgram callback acknowledgement was returned as generated audio',
    );
  }

  assert.ok(
    error instanceof Error,
    'Unsupported callback mode should fail explicitly',
  );
}

main();
