import { tool, type Context } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createMockServerResponse } from '../test/mock-server-response';
import type { InferUITools, UIMessage } from '../ui/ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';
import { ToolLoopAgent } from './tool-loop-agent';

const tools = {
  weather: tool({
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => ({ location, temperature: 72 }),
  }),
};
const agent = new ToolLoopAgent({ model: new MockLanguageModelV4(), tools });
type Metadata = { stepTokens: number };
type Message = UIMessage<
  Metadata,
  { context: { project: string } },
  InferUITools<typeof tools>
>;

describe('agent UI step callback types', () => {
  it('infers tool inputs and outputs separately from generation callbacks', () => {
    void createAgentUIStream({
      agent,
      uiMessages: [],
      onStepEnd: event => {
        for (const call of event.toolCalls) {
          if (!call.dynamic && call.toolName === 'weather') {
            expectTypeOf(call.input).toEqualTypeOf<{ location: string }>();
          }
        }
        // @ts-expect-error Generation events do not contain UI messages.
        event.responseMessage;
      },
      onStepFinish: event => {
        expectTypeOf(event.usage.totalTokens).toEqualTypeOf<
          number | undefined
        >();
      },
      onUIMessageStepEnd: event => {
        for (const part of event.responseMessage.parts) {
          if (
            part.type === 'tool-weather' &&
            part.state === 'output-available'
          ) {
            expectTypeOf(part.input).toEqualTypeOf<{ location: string }>();
            expectTypeOf(part.output).toEqualTypeOf<{
              location: string;
              temperature: number;
            }>();
          }
        }
        // @ts-expect-error UI snapshots do not contain generation usage.
        event.usage;
      },
    });
  });

  it('preserves custom message types across stream and response helpers', () => {
    for (const helper of [
      createAgentUIStream<
        never,
        typeof tools,
        Context,
        never,
        Metadata,
        Message
      >,
      createAgentUIStreamResponse<
        never,
        typeof tools,
        Context,
        never,
        Metadata,
        Message
      >,
    ]) {
      void helper({
        agent,
        uiMessages: [],
        onUIMessageStepEnd: ({ responseMessage, messages, isContinuation }) => {
          expectTypeOf(responseMessage).toEqualTypeOf<Message>();
          expectTypeOf(messages).toEqualTypeOf<Message[]>();
          expectTypeOf(isContinuation).toEqualTypeOf<boolean>();
          expectTypeOf(responseMessage.metadata).toEqualTypeOf<
            Metadata | undefined
          >();
          for (const part of responseMessage.parts) {
            if (part.type === 'data-context') {
              expectTypeOf(part.data).toEqualTypeOf<{ project: string }>();
            }
          }
        },
      });
    }
  });

  it('preserves the custom message type in the Node response helper', () => {
    void pipeAgentUIStreamToResponse<
      never,
      typeof tools,
      Context,
      never,
      Metadata,
      Message
    >({
      response: createMockServerResponse(),
      agent,
      uiMessages: [],
      onUIMessageStepEnd: ({ responseMessage, messages }) => {
        expectTypeOf(responseMessage).toEqualTypeOf<Message>();
        expectTypeOf(messages).toEqualTypeOf<Message[]>();
      },
    });
  });
});
