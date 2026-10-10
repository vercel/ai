import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpenAI } from '../openai-provider';

const modelCases = [
  {
    model: 'gpt-4o-mini-transcribe-2025-03-20',
    unsupportedVerboseJsonResponse: readFixture(
      'gpt-4o-mini-transcribe-2025-03-20-verbose-json-error.json',
    ),
  },
  {
    model: 'gpt-4o-mini-transcribe-2025-12-15',
    unsupportedVerboseJsonResponse: readFixture(
      'gpt-4o-mini-transcribe-2025-12-15-verbose-json-error.json',
    ),
  },
] as const;

function readFixture(filename: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`./__fixtures__/${filename}`, import.meta.url),
      'utf8',
    ),
  );
}

describe('issue #22619', () => {
  it.each(modelCases)(
    'uses a supported default response format for $model',
    async ({ model, unsupportedVerboseJsonResponse }) => {
      const provider = createOpenAI({
        apiKey: 'test-api-key',
        fetch: async (_url, init) => {
          const body = init?.body as FormData;

          return body.get('response_format') === 'json'
            ? Response.json({ text: 'Hello' })
            : Response.json(unsupportedVerboseJsonResponse, { status: 400 });
        },
      });

      await expect(
        provider.transcription(model).doGenerate({
          audio: new Uint8Array([1, 2]),
          mediaType: 'audio/wav',
          providerOptions: { openai: { language: 'en' } },
        }),
      ).resolves.toMatchObject({ text: 'Hello' });
    },
  );
});
