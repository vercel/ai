import { createProdia } from '@ai-sdk/prodia';
import { generateText, streamText, type CallWarning } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  const liveResponse = JSON.parse(
    await readFile(
      '../../packages/prodia/src/__fixtures__/prodia-language-model-nano-banana-live.json',
      'utf8',
    ),
  );
  const requestJobs: unknown[] = [];

  const prodia = createProdia({
    apiKey: 'reproduction-key',
    baseURL: 'https://api.example.com/v2',
    fetch: async (input, init) => {
      if (init?.body instanceof FormData) {
        const job = init.body.get('job');
        if (job instanceof Blob) {
          requestJobs.push(JSON.parse(await job.text()));
        }
      }

      const boundary = 'issue-17938-boundary';
      return new Response(createMultipartBody(boundary, liveResponse), {
        status: 200,
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
      });
    },
  });

  const model = prodia.languageModel('inference.nano-banana.img2img.v2');
  const messages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          image: new Uint8Array([137, 80, 78, 71]),
          mediaType: 'image/png' as const,
        },
        {
          type: 'text' as const,
          text: 'Make this image look like a watercolor painting.',
        },
      ],
    },
  ];

  const generateResult = await generateText({
    model,
    messages,
    seed: 42,
    topK: 10,
  });
  const streamResult = streamText({
    model,
    messages,
    seed: 42,
    topK: 10,
  });
  const streamWarnings = await streamResult.warnings;

  console.log(
    JSON.stringify(
      {
        generateWarnings: generateResult.warnings,
        streamWarnings,
        requestJobs,
      },
      null,
      2,
    ),
  );

  const affectedPaths = [
    !hasUnsupportedSeedWarning(generateResult.warnings) && 'generateText',
    !hasUnsupportedSeedWarning(streamWarnings) && 'streamText',
  ].filter(Boolean);

  if (affectedPaths.length > 0) {
    throw new Error(
      `ISSUE_17938: missing unsupported seed warning in ${affectedPaths.join(
        ' and ',
      )}`,
    );
  }
}

function createMultipartBody(boundary: string, jobResult: unknown) {
  return [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="job"; filename="job.json"\r\n',
    'Content-Type: application/json\r\n',
    '\r\n',
    JSON.stringify(jobResult),
    '\r\n',
    `--${boundary}--\r\n`,
  ].join('');
}

function hasUnsupportedSeedWarning(warnings: CallWarning[] | undefined) {
  return warnings?.some(
    warning => warning.type === 'unsupported' && warning.feature === 'seed',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
