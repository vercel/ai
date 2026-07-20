import type {
  LanguageModelV2Prompt,
  LanguageModelV2ProviderDefinedTool,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const recordedResponse = readFileSync(
  new URL(
    './__fixtures__/google-code-execution-multiple-results.json',
    import.meta.url,
  ),
  'utf8',
);
const parsedRecordedResponse = JSON.parse(recordedResponse);

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: "use code execution to execute the following code snippet:\nprint('ok')\nprint(1/0)",
      },
    ],
  },
];

function createProvider(
  responseBody: string,
  contentType = 'application/json',
) {
  return createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    generateId: () => 'code-execution-call',
    fetch: async () =>
      new Response(responseBody, {
        status: 200,
        headers: { 'content-type': contentType },
      }),
  });
}

describe('issue #11485', () => {
  it('associates every generated code execution result with its executable code', async () => {
    const provider = createProvider(recordedResponse);
    const { content } = await provider
      .languageModel('gemini-3-flash-preview')
      .doGenerate({
        prompt,
        tools: [
          provider.tools.codeExecution(
            {},
          ) as LanguageModelV2ProviderDefinedTool,
        ],
      });

    expect(
      content
        .filter(part => part.type === 'tool-result')
        .map(part => part.toolCallId),
    ).toEqual(['code-execution-call', 'code-execution-call']);
  });

  it('emits every streamed code execution result for its executable code', async () => {
    const provider = createProvider(
      `data: ${JSON.stringify(parsedRecordedResponse)}\n\n`,
      'text/event-stream',
    );
    const { stream } = await provider
      .languageModel('gemini-3-flash-preview')
      .doStream({
        prompt,
        tools: [
          provider.tools.codeExecution(
            {},
          ) as LanguageModelV2ProviderDefinedTool,
        ],
      });

    const events = await convertReadableStreamToArray(stream);

    expect(
      events
        .filter(event => event.type === 'tool-result')
        .map(event => event.toolCallId),
    ).toEqual(['code-execution-call', 'code-execution-call']);
  });
});
