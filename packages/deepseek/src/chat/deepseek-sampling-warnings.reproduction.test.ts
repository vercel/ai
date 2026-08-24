import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import type { DeepSeekLanguageModelChatOptions } from './deepseek-chat-language-model-options';

const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const samplingOptions = {
  temperature: 0.2,
  topP: 0.4,
  frequencyPenalty: 0.5,
  presencePenalty: 0.5,
};

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});

const provider = createDeepSeek({ apiKey: 'test-api-key' });

function hasDeprecatedWarning(
  warnings: SharedV4Warning[],
  setting: string,
): boolean {
  return warnings.some(
    warning =>
      warning.type === 'deprecated' &&
      warning.setting.toLowerCase().includes(setting.toLowerCase()),
  );
}

function hasUnsupportedWarning(
  warnings: SharedV4Warning[],
  feature: string,
): boolean {
  return warnings.some(
    warning =>
      warning.type === 'unsupported' &&
      warning.feature.toLowerCase() === feature.toLowerCase(),
  );
}

function expectDeprecatedSamplingOptionsHandled({
  body,
  warnings,
}: {
  body: Record<string, unknown>;
  warnings: SharedV4Warning[];
}) {
  expect(body).not.toHaveProperty('frequency_penalty');
  expect(body).not.toHaveProperty('presence_penalty');
  expect(hasDeprecatedWarning(warnings, 'frequencyPenalty')).toBe(true);
  expect(hasDeprecatedWarning(warnings, 'presencePenalty')).toBe(true);
}

function expectThinkingSamplingOptionsHandled({
  body,
  warnings,
}: {
  body: Record<string, unknown>;
  warnings: SharedV4Warning[];
}) {
  expect(body).not.toHaveProperty('temperature');
  expect(body).not.toHaveProperty('top_p');
  expect(hasUnsupportedWarning(warnings, 'temperature')).toBe(true);
  expect(hasUnsupportedWarning(warnings, 'topP')).toBe(true);
}

function prepareGenerateResponse() {
  server.urls['https://api.deepseek.com/chat/completions'].response = {
    type: 'json-value',
    body: JSON.parse(
      fs.readFileSync(
        'src/chat/__fixtures__/deepseek-v4-sampling-live.json',
        'utf8',
      ),
    ),
  };
}

function prepareStreamResponse() {
  const chunks = fs
    .readFileSync(
      'src/chat/__fixtures__/deepseek-v4-sampling-live.chunks.txt',
      'utf8',
    )
    .trim()
    .split('\n')
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.deepseek.com/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

describe('issue #19382: DeepSeek sampling warnings', () => {
  beforeEach(() => {
    server.calls.length = 0;
  });

  it('omits deprecated and default-thinking no-op options from generate requests with warnings', async () => {
    prepareGenerateResponse();

    const result = await provider.chat('deepseek-v4-flash').doGenerate({
      prompt,
      ...samplingOptions,
    });
    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;

    expectDeprecatedSamplingOptionsHandled({
      body,
      warnings: result.warnings,
    });
    expectThinkingSamplingOptionsHandled({ body, warnings: result.warnings });
  });

  it('omits deprecated and default-thinking no-op options from stream requests with warnings', async () => {
    prepareStreamResponse();

    const result = await provider.chat('deepseek-v4-flash').doStream({
      prompt,
      ...samplingOptions,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const streamStart = parts.find(part => part.type === 'stream-start');
    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;

    expect(streamStart?.type).toBe('stream-start');
    if (streamStart?.type !== 'stream-start') {
      throw new Error('stream-start part was not emitted');
    }
    expectDeprecatedSamplingOptionsHandled({
      body,
      warnings: streamStart.warnings,
    });
    expectThinkingSamplingOptionsHandled({
      body,
      warnings: streamStart.warnings,
    });
  });

  it.each(['generate', 'stream'] as const)(
    'preserves temperature and topP with explicitly disabled thinking for %s requests',
    async mode => {
      if (mode === 'generate') {
        prepareGenerateResponse();
      } else {
        prepareStreamResponse();
      }

      const model = provider.chat('deepseek-v4-flash');
      const options = {
        prompt,
        ...samplingOptions,
        providerOptions: {
          deepseek: {
            thinking: { type: 'disabled' },
          } satisfies DeepSeekLanguageModelChatOptions,
        },
      };

      let warnings: SharedV4Warning[];
      if (mode === 'generate') {
        warnings = (await model.doGenerate(options)).warnings;
      } else {
        const result = await model.doStream(options);
        const parts = await convertReadableStreamToArray(result.stream);
        const streamStart = parts.find(part => part.type === 'stream-start');
        expect(streamStart?.type).toBe('stream-start');
        if (streamStart?.type !== 'stream-start') {
          throw new Error('stream-start part was not emitted');
        }
        warnings = streamStart.warnings;
      }

      const body = (await server.calls[0].requestBodyJson) as Record<
        string,
        unknown
      >;
      expect(body.temperature).toBe(0.2);
      expect(body.top_p).toBe(0.4);
      expectDeprecatedSamplingOptionsHandled({ body, warnings });
      expect(hasUnsupportedWarning(warnings, 'temperature')).toBe(false);
      expect(hasUnsupportedWarning(warnings, 'topP')).toBe(false);
    },
  );
});
