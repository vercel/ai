import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { GenerateTextOnStepEndCallback } from '../generate-text/generate-text-events';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createMockServerResponse } from '../test/mock-server-response';
import type { InferUITools, UIDataTypes, UIMessage } from '../ui/ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';
import { ToolLoopAgent } from './tool-loop-agent';

const tools = {
  lookup: tool({
    inputSchema: z.object({ value: z.string() }),
    execute: ({ value }) => ({ found: value }),
  }),
};
type RuntimeContext = { requestId: string };
type Message = UIMessage<
  { label: string },
  UIDataTypes,
  InferUITools<typeof tools>
>;
const agent = new ToolLoopAgent<never, typeof tools, RuntimeContext>({
  model: new MockLanguageModelV4(),
  tools,
  runtimeContext: { requestId: 'test' },
});

describe('agent UI onStepEnd callback types', () => {
  it('retains tools and runtime context while inferring UI metadata', () => {
    createAgentUIStream({
      agent,
      uiMessages: [],
      originalMessages: [] as Message[],
      onStepEnd: event => {
        expectTypeOf(event.responseMessage).toEqualTypeOf<Message>();
        expectTypeOf(event.messages).toEqualTypeOf<Message[]>();
        expectTypeOf(event.isContinuation).toEqualTypeOf<boolean>();
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
        expectTypeOf(event.staticToolCalls[0].input).toEqualTypeOf<{
          value: string;
        }>();
        expectTypeOf(event.staticToolResults[0].output).toEqualTypeOf<{
          found: string;
        }>();
      },
    });
  });

  it('exposes the same event through the response and pipe helpers', () => {
    createAgentUIStreamResponse({
      agent,
      uiMessages: [],
      originalMessages: [] as Message[],
      onStepEnd: event => {
        expectTypeOf(event.responseMessage).toEqualTypeOf<Message>();
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
      },
    });
    pipeAgentUIStreamToResponse({
      agent,
      uiMessages: [],
      response: createMockServerResponse(),
      originalMessages: [] as Message[],
      onStepEnd: event => {
        expectTypeOf(event.responseMessage).toEqualTypeOf<Message>();
        expectTypeOf(event.runtimeContext).toEqualTypeOf<RuntimeContext>();
      },
    });
  });

  it('accepts existing model step callbacks', () => {
    const onStepEnd: GenerateTextOnStepEndCallback<
      typeof tools,
      RuntimeContext
    > = () => {};
    createAgentUIStream({ agent, uiMessages: [], onStepEnd });
    createAgentUIStreamResponse({ agent, uiMessages: [], onStepEnd });
    pipeAgentUIStreamToResponse({
      agent,
      uiMessages: [],
      response: createMockServerResponse(),
      onStepEnd,
    });
  });
});
