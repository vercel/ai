import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

const jsonFixture = JSON.parse(
  fs.readFileSync(
    'src/chat/__fixtures__/deepseek-system-fingerprint.json',
    'utf8',
  ),
);
const chunkFixtures = fs
  .readFileSync(
    'src/chat/__fixtures__/deepseek-system-fingerprint.chunks.txt',
    'utf8',
  )
  .trim()
  .split('\n');
const expectedFingerprint = jsonFixture.system_fingerprint;

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});
const provider = createDeepSeek({ apiKey: 'test-api-key' });

function getFinishPart(
  parts: LanguageModelV4StreamPart[],
): Extract<LanguageModelV4StreamPart, { type: 'finish' }> {
  const finish = parts.find(
    (part): part is Extract<LanguageModelV4StreamPart, { type: 'finish' }> =>
      part.type === 'finish',
  );

  if (finish == null) {
    throw new Error('Expected a finish stream part.');
  }

  return finish;
}

describe('DeepSeek system_fingerprint reproduction', () => {
  it('preserves the fingerprint in generate provider metadata', async () => {
    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'json-value',
      body: jsonFixture,
    };

    const result = await provider('deepseek-v4-flash').doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.content).toStrictEqual([{ type: 'text', text: 'OK' }]);
    expect(result.usage).toMatchObject({
      inputTokens: { total: 9 },
      outputTokens: { total: 1 },
    });
    expect(result.providerMetadata?.deepseek.systemFingerprint).toBe(
      expectedFingerprint,
    );
  });

  it('preserves the repeated fingerprint in stream provider metadata', async () => {
    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'stream-chunks',
      chunks: [
        ...chunkFixtures.map(chunk => `data: ${chunk}\n\n`),
        'data: [DONE]\n\n',
      ],
    };

    const result = await provider('deepseek-v4-flash').doStream({
      prompt: TEST_PROMPT,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const finish = getFinishPart(parts);

    expect(
      parts
        .filter(part => part.type === 'text-delta')
        .map(part => part.delta)
        .join(''),
    ).toBe('OK');
    expect(finish.usage).toMatchObject({
      inputTokens: { total: 9 },
      outputTokens: { total: 1 },
    });
    expect(finish.providerMetadata?.deepseek.systemFingerprint).toBe(
      expectedFingerprint,
    );
  });

  it.each([null, undefined])(
    'tolerates a %s fingerprint in generate responses',
    async systemFingerprint => {
      const responseBody = {
        ...jsonFixture,
        system_fingerprint: systemFingerprint,
      };
      if (systemFingerprint === undefined) {
        delete responseBody.system_fingerprint;
      }

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'json-value',
        body: responseBody,
      };

      const result = await provider('deepseek-v4-flash').doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result.content).toStrictEqual([{ type: 'text', text: 'OK' }]);
    },
  );

  it.each([null, undefined])(
    'tolerates a %s fingerprint in stream chunks',
    async systemFingerprint => {
      const chunks = chunkFixtures.map(chunk => {
        const value = JSON.parse(chunk);
        if (systemFingerprint === undefined) {
          delete value.system_fingerprint;
        } else {
          value.system_fingerprint = systemFingerprint;
        }
        return `data: ${JSON.stringify(value)}\n\n`;
      });

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks: [...chunks, 'data: [DONE]\n\n'],
      };

      const result = await provider('deepseek-v4-flash').doStream({
        prompt: TEST_PROMPT,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(
        parts
          .filter(part => part.type === 'text-delta')
          .map(part => part.delta)
          .join(''),
      ).toBe('OK');
    },
  );
});
