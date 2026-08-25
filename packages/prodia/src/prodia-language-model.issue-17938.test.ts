import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProdiaLanguageModel } from './prodia-language-model';

const liveResponse = JSON.parse(
  readFileSync(
    'src/__fixtures__/prodia-language-model-nano-banana-live.json',
    'utf8',
  ),
);

function createModel() {
  return new ProdiaLanguageModel('inference.nano-banana.img2img.v2', {
    provider: 'prodia.language',
    baseURL: 'https://api.example.com/v2',
    headers: {},
    fetch: async () => {
      const boundary = 'issue-17938-boundary';
      return new Response(createMultipartBody(boundary, liveResponse), {
        status: 200,
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
      });
    },
  });
}

const options = {
  prompt: [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'Edit this image.' }],
    },
  ],
  seed: 42,
  topK: 10,
  providerOptions: {},
};

describe('issue #17938', () => {
  it('warns when doGenerate receives an unsupported seed', async () => {
    const result = await createModel().doGenerate(options);

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'seed',
    });
  });

  it('warns when doStream receives an unsupported seed', async () => {
    const { stream } = await createModel().doStream(options);
    const parts = [];
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value);
    }

    expect(parts).toContainEqual({
      type: 'stream-start',
      warnings: expect.arrayContaining([
        { type: 'unsupported', feature: 'seed' },
      ]),
    });
  });
});

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
