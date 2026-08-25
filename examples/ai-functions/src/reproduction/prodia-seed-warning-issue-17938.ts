import { createProdia } from '@ai-sdk/prodia';
import { generateText, streamText } from 'ai';
import { readFile } from 'node:fs/promises';

type RecordedFixture = {
  response: Record<string, unknown>;
};

function createMultipartResponse(jobResult: Record<string, unknown>) {
  const boundary = 'issue-17938-boundary';
  const body = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="job"; filename="job.json"\r\n',
    'Content-Type: application/json\r\n',
    '\r\n',
    JSON.stringify(jobResult),
    '\r\n',
    `--${boundary}--\r\n`,
  ].join('');

  return new Response(body, {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  });
}

function unsupportedFeatures(
  warnings: Array<{ type: string; feature?: string }> | undefined,
) {
  return (
    warnings
      ?.filter(warning => warning.type === 'unsupported')
      .map(warning => warning.feature) ?? []
  );
}

async function main() {
  globalThis.AI_SDK_LOG_WARNINGS = false;

  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/prodia/src/__fixtures__/prodia-language-model-nano-banana-live.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as RecordedFixture;

  const requestConfigs: Array<Record<string, unknown>> = [];
  const fetchMock: typeof fetch = async (_input, init) => {
    if (!(init?.body instanceof FormData)) {
      throw new Error('Reproduction setup failed: expected multipart FormData');
    }

    const jobPart = init.body.get('job');
    if (!(jobPart instanceof Blob)) {
      throw new Error('Reproduction setup failed: expected a job Blob');
    }

    const job = JSON.parse(await jobPart.text()) as {
      config: Record<string, unknown>;
    };
    requestConfigs.push(job.config);

    return createMultipartResponse(fixture.response);
  };

  const prodia = createProdia({
    apiKey: 'test-key',
    fetch: fetchMock,
  });
  const model = prodia.languageModel('inference.nano-banana.img2img.v2');
  const image = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7N8AAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const call = {
    model,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'file' as const, mediaType: 'image/png', data: image },
          { type: 'text' as const, text: 'Edit this image' },
        ],
      },
    ],
    seed: 42,
    topK: 10,
  };

  const generateResult = await generateText(call);
  const streamResult = streamText(call);
  const streamWarnings = await streamResult.warnings;

  const generateFeatures = unsupportedFeatures(generateResult.warnings);
  const streamFeatures = unsupportedFeatures(streamWarnings);

  if (!generateFeatures.includes('topK') || !streamFeatures.includes('topK')) {
    throw new Error(
      'Reproduction setup failed: topK did not produce the contrast warning',
    );
  }

  if (
    requestConfigs.length !== 2 ||
    requestConfigs.some(config => Object.hasOwn(config, 'seed'))
  ) {
    throw new Error(
      'Reproduction setup failed: seed request-shaping precondition changed',
    );
  }

  const missingPaths = [
    !generateFeatures.includes('seed') && 'generateText',
    !streamFeatures.includes('seed') && 'streamText',
  ].filter(Boolean);

  if (missingPaths.length > 0) {
    throw new Error(
      `Issue #17938 reproduced: missing unsupported seed warning in ${missingPaths.join(
        ' and ',
      )}`,
    );
  }

  console.log(
    'Issue #17938 no longer reproduces: both paths warn about unsupported seed.',
  );
}

main();
