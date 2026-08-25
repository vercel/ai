import fs from 'node:fs';
import type { LanguageModelV2CallWarning } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { ProdiaLanguageModel } from './prodia-language-model';

const fixture = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/prodia-language-model-nano-banana-issue-17938-live.json',
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

function createModel() {
  return new ProdiaLanguageModel('inference.nano-banana.img2img.v2', {
    provider: 'prodia.language',
    baseURL: 'https://api.example.com/v2',
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch: async () => createMultipartResponse(),
  });
}

const callOptions = {
  prompt: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'file' as const,
          mediaType: 'image/png',
          data: new Uint8Array([1, 2, 3]),
        },
        { type: 'text' as const, text: 'Make this image a watercolor' },
      ],
    },
  ],
  seed: 42,
  topK: 10,
  providerOptions: {},
};

function unsupportedSettings(
  warnings: LanguageModelV2CallWarning[] | undefined,
) {
  return warnings?.flatMap(warning =>
    warning.type === 'unsupported-setting' ? [warning.setting] : [],
  );
}

describe('issue #17938', () => {
  it('warns when generate receives the unsupported seed setting', async () => {
    const result = await createModel().doGenerate(callOptions);

    expect(unsupportedSettings(result.warnings)).toContain('topK');
    expect(unsupportedSettings(result.warnings)).toContain('seed');
  });

  it('warns when stream receives the unsupported seed setting', async () => {
    const result = await createModel().doStream(callOptions);
    const parts = [];
    const reader = result.stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value);
    }

    const streamStart = parts.find(part => part.type === 'stream-start');
    const finish = parts.find(part => part.type === 'finish');

    expect(finish).toBeDefined();
    expect(streamStart?.type).toBe('stream-start');
    if (streamStart?.type === 'stream-start') {
      expect(unsupportedSettings(streamStart.warnings)).toContain('topK');
      expect(unsupportedSettings(streamStart.warnings)).toContain('seed');
    }
  });
});
