import type { Context } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { ToolLoopAgent } from '../agent/tool-loop-agent';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { ChatTransport } from './chat-transport';
import { DirectChatTransport } from './direct-chat-transport';
import type { UIMessage } from './ui-messages';

type ReportMessage = UIMessage<
  unknown,
  {
    report: { text: string };
    attachment: { mediaType: string; data: string };
  },
  {}
>;

describe('DirectChatTransport', () => {
  it('types custom data part conversion from the transport message type', () => {
    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4(),
    });

    const transport = new DirectChatTransport<
      never,
      {},
      Context,
      never,
      ReportMessage
    >({
      agent,
      convertDataPart: part => {
        if (part.type === 'data-report') {
          expectTypeOf(part.data).toEqualTypeOf<{ text: string }>();
          return { type: 'text', text: part.data.text };
        }

        expectTypeOf(part.data).toEqualTypeOf<{
          mediaType: string;
          data: string;
        }>();
        return {
          type: 'file',
          mediaType: part.data.mediaType,
          data: part.data.data,
        };
      },
    });

    expectTypeOf(transport).toMatchTypeOf<ChatTransport<ReportMessage>>();
  });
});
