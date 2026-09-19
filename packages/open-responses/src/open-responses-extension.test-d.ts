import type { LanguageModelV4Content } from '@ai-sdk/provider';
import { describe, expectTypeOf, it } from 'vitest';
import {
  createOpenResponses,
  type Experimental_OpenResponsesBareExtension,
  type Experimental_OpenResponsesExtension,
  type Experimental_OpenResponsesNamespacedType,
  type OpenResponsesProviderSettings,
} from './index';

describe('OpenResponsesExtension', () => {
  it('should remain extendable and implementable', () => {
    interface CustomExtension extends Experimental_OpenResponsesExtension {
      label: string;
    }

    class ExtensionCodec implements Experimental_OpenResponsesExtension {
      readonly id = 'acme.search';
      readonly toolType = 'acme:search';

      encodeTool() {
        return {};
      }
    }

    const extension: CustomExtension = {
      id: 'acme.search',
      itemTypes: ['acme:search_call'],
      label: 'Search',
      decodeItem: () => undefined,
    };

    expectTypeOf(extension).toExtend<Experimental_OpenResponsesExtension>();
    expectTypeOf(
      new ExtensionCodec(),
    ).toExtend<Experimental_OpenResponsesExtension>();
  });

  it('should preserve namespaced callback discriminator types', () => {
    const extension: Experimental_OpenResponsesExtension = {
      id: 'acme.search',
      itemTypes: ['acme:search_call'],
      eventTypes: ['acme:search_delta'],
      decodeItem: ({ item }) => {
        const type: Experimental_OpenResponsesNamespacedType = item.type;
        expectTypeOf(type).toEqualTypeOf(item.type);
        return undefined;
      },
      decodeEvent: ({ event }) => {
        const type: Experimental_OpenResponsesNamespacedType = event.type;
        expectTypeOf(type).toEqualTypeOf(event.type);
        return undefined;
      },
    };

    expectTypeOf(
      extension,
    ).toMatchTypeOf<Experimental_OpenResponsesExtension>();
  });

  it('should expose typed codec callbacks in provider settings', () => {
    const extension = {
      id: 'acme.search',
      toolType: 'acme:search',
      itemTypes: ['acme:search_call'],
      eventTypes: ['acme:search_delta'],
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
          providerExecuted: true,
        },
      ],
      decodeEvent: () => undefined,
    } satisfies Experimental_OpenResponsesExtension;

    const settings = {
      name: 'acme',
      url: 'https://example.com/v1/responses',
      experimental_extensions: [extension],
    } satisfies OpenResponsesProviderSettings;

    expectTypeOf(settings).toMatchTypeOf<OpenResponsesProviderSettings>();
    expectTypeOf(
      createOpenResponses(settings)('model').doGenerate,
    ).toBeFunction();
    expectTypeOf<Awaited<ReturnType<typeof extension.decodeItem>>>().toExtend<
      LanguageModelV4Content[] | undefined
    >();
  });

  it('should require dedicated fields for bare extension types', () => {
    const extension = {
      id: 'acme.web_search',
      allowBareTypes: true,
      bareToolType: 'web_search',
      bareItemTypes: ['web_search_call'],
      bareEventTypes: ['response.web_search_call.completed'],
      encodeTool: () => ({}),
      decodeItem: ({ item }) => {
        expectTypeOf(item.type).toBeString();
        return undefined;
      },
      decodeEvent: ({ event }) => {
        expectTypeOf(event.type).toBeString();
        return undefined;
      },
    } satisfies Experimental_OpenResponsesBareExtension;

    expectTypeOf(
      extension,
    ).toMatchTypeOf<Experimental_OpenResponsesBareExtension>();

    const invalidExtension = {
      id: 'acme.web_search',
      // @ts-expect-error - bare types require the explicit bareToolType field
      toolType: 'web_search',
      encodeTool: () => ({}),
    } satisfies Experimental_OpenResponsesExtension;

    expectTypeOf(invalidExtension.id).toBeString();
  });
});
