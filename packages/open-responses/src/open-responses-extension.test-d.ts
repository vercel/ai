import type { LanguageModelV4Content } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import {
  createOpenResponses,
  type OpenResponsesExtension,
  type OpenResponsesProviderSettings,
} from './index';

describe('OpenResponsesExtension', () => {
  it('should expose typed codec callbacks in provider settings', () => {
    const extension = {
      id: 'acme.search',
      toolType: 'acme:search',
      itemTypes: ['acme:search_call'],
      eventTypes: ['acme:search_delta'],
      providerExecuted: true,
      encodeTool: ({ name, args }) => ({
        name,
        configured: Object.keys(args).length > 0,
      }),
      decodeItem: ({ item }) => [
        {
          type: 'tool-call',
          toolCallId: item.id,
          toolName: 'search',
          input: '{}',
        },
      ],
    } satisfies OpenResponsesExtension;

    const settings = {
      name: 'acme',
      url: 'https://example.com/v1/responses',
      extensions: [extension],
    } satisfies OpenResponsesProviderSettings;

    expectTypeOf(settings).toMatchTypeOf<OpenResponsesProviderSettings>();
    expectTypeOf(
      createOpenResponses(settings)('model').doGenerate,
    ).toBeFunction();
    expectTypeOf<Awaited<ReturnType<typeof extension.decodeItem>>>().toExtend<
      LanguageModelV4Content[] | undefined
    >();
  });
});
