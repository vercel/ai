import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});

const provider = createDeepSeek({ apiKey: 'test-api-key' });

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with exactly: OK' }],
  },
];

const providerOptions = {
  deepseek: {
    logprobs: true,
    topLogprobs: 1,
  },
};

function containsLogprobToken(value: unknown) {
  return JSON.stringify(value).includes('"OK"');
}

describe('issue #19377', () => {
  it('preserves documented logprobs request and response data', async () => {
    const gaps: string[] = [];

    server.urls['https://api.deepseek.com/chat/completions'].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/chat/__fixtures__/issue-19377-logprobs.json',
          'utf8',
        ),
      ),
    };

    const generateResult = await provider
      .chat('deepseek-v4-flash')
      .doGenerate({ prompt, providerOptions });
    const generateRequest = await server.calls.at(-1)!.requestBodyJson;

    if (
      generateRequest.logprobs !== true ||
      generateRequest.top_logprobs !== 1
    ) {
      gaps.push('JSON request omits logprobs/top_logprobs');
    }

    if (!containsLogprobToken(generateResult.providerMetadata?.deepseek)) {
      gaps.push('JSON result discards response logprobs');
    }

    const chunks = fs
      .readFileSync(
        'src/chat/__fixtures__/issue-19377-logprobs.chunks.txt',
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

    const streamResult = await provider
      .chat('deepseek-v4-flash')
      .doStream({ prompt, providerOptions });
    const streamParts = await convertReadableStreamToArray(streamResult.stream);
    const streamRequest = await server.calls.at(-1)!.requestBodyJson;

    if (streamRequest.logprobs !== true || streamRequest.top_logprobs !== 1) {
      gaps.push('SSE request omits logprobs/top_logprobs');
    }

    const finish = streamParts.find(part => part.type === 'finish');
    if (
      finish?.type !== 'finish' ||
      !containsLogprobToken(finish.providerMetadata?.deepseek)
    ) {
      gaps.push('SSE result discards response logprobs');
    }

    if (gaps.length > 0) {
      throw new Error(
        `Issue #19377 reproduced: DeepSeek logprobs request/response parity is missing (${gaps.join(
          '; ',
        )})`,
      );
    }
  });
});
