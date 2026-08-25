import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createProdia } from './prodia-provider';

const fixture = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/prodia-language-model-nano-banana-live.json',
    'utf8',
  ),
) as { response: Record<string, unknown> };

function createMultipartResponse() {
  const boundary = 'issue-17938-boundary';
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

function createModel() {
  return createProdia({
    apiKey: 'test-key',
    fetch: async () => createMultipartResponse(),
  }).languageModel('inference.nano-banana.img2img.v2');
}

const options = {
  prompt: [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'Edit this image' }],
    },
  ],
  seed: 42,
  topK: 10,
  providerOptions: {},
};

describe('issue #17938', () => {
  it('warns when doGenerate drops the unsupported seed setting', async () => {
    const result = await createModel().doGenerate(options);

    expect(result.warnings).toContainEqual({
      type: 'unsupported',
      feature: 'seed',
    });
  });

  it('warns when doStream drops the unsupported seed setting', async () => {
    const result = await createModel().doStream(options);
    const firstPart = await result.stream.getReader().read();

    expect(firstPart.value).toMatchObject({
      type: 'stream-start',
      warnings: expect.arrayContaining([
        { type: 'unsupported', feature: 'seed' },
      ]),
    });
  });
});
