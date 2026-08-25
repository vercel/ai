import fs from 'node:fs';
import { createProdia } from '@ai-sdk/prodia';
import { generateText, streamText, type CallWarning } from 'ai';

const fixture = JSON.parse(
  fs.readFileSync(
    '../../packages/prodia/src/__fixtures__/prodia-language-model-nano-banana-issue-17938-live.json',
    'utf8',
  ),
);

function createMultipartResponse() {
  const boundary = 'issue-17938-live-response';
  const body = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="job"; filename="job.json"\r\n',
    'Content-Type: application/json\r\n',
    '\r\n',
    JSON.stringify(fixture.response),
    '\r\n',
    `--${boundary}--\r\n`,
  ].join('');

  return new Response(body, {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
  });
}

function unsupportedSettings(warnings: CallWarning[] | undefined) {
  return (
    warnings
      ?.filter(warning => warning.type === 'unsupported-setting')
      .map(warning => warning.setting) ?? []
  );
}

async function main() {
  const submittedJobs: unknown[] = [];
  const prodia = createProdia({
    apiKey: 'replay-key',
    baseURL: 'https://api.example.com/v2',
    fetch: async (_input, init) => {
      if (init?.body instanceof FormData) {
        const job = init.body.get('job');
        if (job instanceof Blob) {
          submittedJobs.push(JSON.parse(await job.text()));
        }
      }
      return createMultipartResponse();
    },
  });

  const model = prodia.languageModel('inference.nano-banana.img2img.v2');
  const request = {
    model,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            image: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
          {
            type: 'text' as const,
            text: 'Make this image look like a watercolor painting',
          },
        ],
      },
    ],
    seed: 42,
    topK: 10,
  };

  const generateResult = await generateText(request);
  const streamResult = streamText(request);
  await streamResult.consumeStream();
  const streamWarnings = await streamResult.warnings;

  const generateSettings = unsupportedSettings(generateResult.warnings);
  const streamSettings = unsupportedSettings(streamWarnings);

  if (!generateSettings.includes('topK') || !streamSettings.includes('topK')) {
    throw new Error(
      'Reproduction harness invalid: Prodia did not report the topK control warning.',
    );
  }

  const missingSeedPaths = [
    !generateSettings.includes('seed') ? 'generateText' : undefined,
    !streamSettings.includes('seed') ? 'streamText' : undefined,
  ].filter((path): path is string => path !== undefined);

  if (missingSeedPaths.length > 0) {
    console.error(
      `ISSUE_17938_REPRODUCED: Prodia silently drops seed without an unsupported-setting warning in ${missingSeedPaths.join(
        ' and ',
      )}.`,
    );
    console.error(
      JSON.stringify(
        {
          generateWarnings: generateResult.warnings,
          streamWarnings,
          submittedJobs,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    'Issue #17938 is fixed: generateText and streamText both warn about seed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
