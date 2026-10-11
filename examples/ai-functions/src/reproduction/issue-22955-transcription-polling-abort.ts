import { createAssemblyAI } from '@ai-sdk/assemblyai';
import { createFal } from '@ai-sdk/fal';
import { createGladia } from '@ai-sdk/gladia';
import type { TranscriptionModelV4 } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { createRevai } from '@ai-sdk/revai';
import assert from 'node:assert/strict';

type ProviderName = 'assemblyai' | 'gladia' | 'revai' | 'fal';

type CheckResult = {
  name: ProviderName;
  abortDelayMs: number;
  errorName: string;
  statusPolls: number;
};

class ReproducedBugError extends Error {}

async function check(
  name: ProviderName,
  createModel: (fetch: FetchFunction) => TranscriptionModelV4,
): Promise<CheckResult> {
  const controller = new AbortController();
  let abortAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let statusPolls = 0;

  const fetch: FetchFunction = async (url, init) => {
    init?.signal?.throwIfAborted();

    if (init?.method === 'POST') {
      if (String(url).endsWith('/upload')) {
        return Response.json(
          name === 'gladia'
            ? { audio_url: 'https://api.gladia.io/audio' }
            : { upload_url: 'https://example.com/audio' },
        );
      }

      if (name === 'gladia') {
        return Response.json({
          result_url: 'https://api.gladia.io/v2/pre-recorded/job',
        });
      }

      if (name === 'fal') {
        return Response.json({ request_id: 'job' });
      }

      return Response.json({
        id: 'job',
        status: name === 'revai' ? 'in_progress' : 'queued',
      });
    }

    statusPolls++;
    timer ??= setTimeout(() => {
      abortAt = performance.now();
      controller.abort(new DOMException('Stopped', 'AbortError'));
    }, 20);

    if (name === 'fal') {
      return Response.json(
        { detail: 'Request is still in progress' },
        { status: 400 },
      );
    }

    return Response.json({
      id: 'job',
      status: name === 'revai' ? 'in_progress' : 'processing',
    });
  };

  try {
    await createModel(fetch).doGenerate({
      audio: new Uint8Array([0]),
      mediaType: 'audio/wav',
      providerOptions: {},
      abortSignal: controller.signal,
    });
  } catch (error) {
    assert.ok(
      abortAt != null,
      `${name}: failed before the abort was triggered`,
    );
    assert.ok(error instanceof Error, `${name}: rejected with a non-Error`);

    return {
      name,
      abortDelayMs: Math.round(performance.now() - abortAt),
      errorName: error.name,
      statusPolls,
    };
  } finally {
    clearTimeout(timer);
  }

  throw new Error(`${name}: expected cancellation to reject`);
}

async function main() {
  const results = await Promise.all([
    check('assemblyai', fetch =>
      createAssemblyAI({ apiKey: 'synthetic', fetch }).transcription(
        'universal-3-5-pro',
      ),
    ),
    check('gladia', fetch =>
      createGladia({ apiKey: 'synthetic', fetch }).transcription(),
    ),
    check('revai', fetch =>
      createRevai({ apiKey: 'synthetic', fetch }).transcription('machine'),
    ),
    check('fal', fetch =>
      createFal({ apiKey: 'synthetic', fetch }).transcription('whisper'),
    ),
  ]);

  console.log(JSON.stringify(results, null, 2));

  const slowProviders = results.filter(result => result.abortDelayMs >= 300);
  if (slowProviders.length > 0) {
    throw new ReproducedBugError(
      `ISSUE #22955 REPRODUCED: transcription cancellation waited for polling sleep (${slowProviders
        .map(result => `${result.name}=${result.abortDelayMs}ms`)
        .join(', ')})`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
