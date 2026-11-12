import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFal } from '@ai-sdk/fal';
import { createOpenAI } from '@ai-sdk/openai';
import {
  createDownload,
  generateImage,
  generateText,
  streamText,
  transcribe,
} from 'ai';
import { createGuardedFetch } from 'guarded-fetch';
import { run } from '../lib/run';

// Run with DOTENV_CONFIG_PATH pointing to the authorized credentials file.
// Report only stage, status and error class, never headers or API error bodies.
run(async () => {
  const transport = createGuardedFetch();
  const hosts = new Set<string>();
  let downloads = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url,
    );
    hosts.add(url.hostname);
    return transport(input, init);
  };
  const openai = createOpenAI({ fetch });
  let stage = 'OpenAI native Request';
  try {
    const response = await fetch(
      new Request('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(30_000),
      }),
    );
    assert.equal(response.status, 200);
    await response.body?.cancel();
    console.log(`PASS ${stage}`);

    stage = 'OpenAI generateText';
    const generated = await generateText({
      model: openai('gpt-4.1-mini'),
      prompt: 'Reply with the word hello.',
      maxOutputTokens: 20,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    assert.match(generated.text.toLowerCase(), /hello/);
    console.log(`PASS ${stage}`);

    stage = 'OpenAI streamText';
    const streamed = streamText({
      model: openai('gpt-4.1-mini'),
      prompt: 'Reply with the word hello.',
      maxOutputTokens: 20,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    let text = '';
    for await (const part of streamed.textStream) text += part;
    assert.match(text.toLowerCase(), /hello/);
    console.log(`PASS ${stage}`);

    stage = 'OpenAI cancellation after streaming headers';
    const controller = new AbortController();
    const cancelledResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: 'Count from 1 to 1000.' }],
          stream: true,
          max_tokens: 100,
        }),
      },
    );
    assert.equal(cancelledResponse.status, 200);
    assert.ok(cancelledResponse.body);
    const reader = cancelledResponse.body.getReader();
    assert.equal((await reader.read()).done, false);
    controller.abort();
    await assert.rejects(reader.read(), { name: 'AbortError' });
    console.log(`PASS ${stage}`);

    stage = 'core image URL download and OpenAI vision';
    const download = createDownload({ fetch, maxBytes: 10 * 1024 * 1024 });
    // Chat models accept remote image URLs natively. This wrapper forces the
    // SDK download path so that the custom transport is exercised locally.
    const model = openai.chat('gpt-4.1-mini');
    const imageModel = {
      ...model,
      provider: model.provider,
      supportedUrls: {},
      doGenerate: model.doGenerate.bind(model),
      doStream: model.doStream.bind(model),
    };
    const vision = await generateText({
      model: imageModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the image in five words.' },
            {
              type: 'image',
              image: new URL(
                'https://raw.githubusercontent.com/vercel/ai/main/examples/ai-functions/data/comic-cat.png',
              ),
            },
          ],
        },
      ],
      experimental_download: async requests =>
        Promise.all(
          requests.map(async ({ url }) => {
            downloads++;
            const result = await download({
              url,
              abortSignal: AbortSignal.timeout(30_000),
            });
            return { data: result.data, mediaType: result.mediaType };
          }),
        ),
      maxOutputTokens: 40,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(45_000),
    });
    assert.ok(vision.text.length > 0);
    assert.equal(downloads, 1);
    console.log(`PASS ${stage}`);

    stage = 'OpenAI multipart transcription';
    const transcription = await transcribe({
      model: openai.transcription('whisper-1'),
      audio: await readFile(new URL('../../data/galileo.mp3', import.meta.url)),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
    });
    assert.ok(transcription.text.length > 0);
    console.log(`PASS ${stage}`);

    stage = 'Fal generation and authenticated response URL download';
    const fal = createFal({ fetch });
    const image = await generateImage({
      model: fal.image('fal-ai/flux/schnell'),
      prompt: 'A small blue circle on white.',
      size: '256x256',
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(90_000),
    });
    assert.ok(image.image.uint8Array.byteLength > 0);
    assert.ok(hosts.has('fal.run'));
    assert.ok(
      [...hosts].some(
        host =>
          host !== 'api.openai.com' &&
          host !== 'fal.run' &&
          host !== 'raw.githubusercontent.com',
      ),
    );
    console.log(`PASS ${stage}`);
    console.log(
      JSON.stringify({ status: 'passed', downloads, hosts: [...hosts].sort() }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'failed',
        stage,
        name: error instanceof Error ? error.name : typeof error,
        statusCode:
          error && typeof error === 'object' && 'statusCode' in error
            ? error.statusCode
            : undefined,
      }),
    );
    process.exitCode = 1;
  } finally {
    await transport.close();
  }
});
