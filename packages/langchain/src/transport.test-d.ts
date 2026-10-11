import type { RunnableConfig } from '@langchain/core/runnables';
import type { UIMessage } from 'ai';
import { describe, expectTypeOf, it } from 'vitest';
import {
  LangSmithDeploymentTransport,
  type PrepareRemoteGraphConfig,
} from './index';

type CustomUIMessage = UIMessage<{ source: string }>;

describe('LangSmithDeploymentTransport', () => {
  it('types per-request RemoteGraph configuration', () => {
    const prepareRemoteGraphConfig: PrepareRemoteGraphConfig<
      CustomUIMessage
    > = async options => {
      expectTypeOf(options.chatId).toEqualTypeOf<string>();
      expectTypeOf(options.messages).toEqualTypeOf<CustomUIMessage[]>();
      expectTypeOf(options.trigger).toEqualTypeOf<
        'submit-message' | 'regenerate-message'
      >();
      expectTypeOf(options.messageId).toEqualTypeOf<string | undefined>();
      expectTypeOf(options.body).toEqualTypeOf<object | undefined>();
      expectTypeOf(options.metadata).toEqualTypeOf<unknown>();
      expectTypeOf(options.abortSignal).toEqualTypeOf<
        AbortSignal | undefined
      >();

      return {
        configurable: { thread_id: options.chatId },
        metadata: { source: options.messages[0]?.metadata?.source },
        tags: ['chat'],
      };
    };

    const transport = new LangSmithDeploymentTransport<CustomUIMessage>({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig,
    });

    expectTypeOf(transport).toMatchTypeOf<
      LangSmithDeploymentTransport<CustomUIMessage>
    >();
    expectTypeOf<
      Awaited<ReturnType<PrepareRemoteGraphConfig<CustomUIMessage>>>
    >().toEqualTypeOf<RunnableConfig>();
  });

  it('keeps stream modes owned by the transport', () => {
    new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      // @ts-expect-error streamMode is managed by the transport
      prepareRemoteGraphConfig: () => ({
        streamMode: ['custom'],
      }),
    });
  });
});
