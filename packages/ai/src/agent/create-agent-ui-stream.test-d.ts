import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { UIMessage } from '../ui/ui-messages';
import type { UIMessageStreamOnStepEndCallback } from '../ui-message-stream';
import type { GenerateTextStepEndEvent } from '../generate-text/generate-text-events';
import { createAgentUIStream } from './create-agent-ui-stream';
import { ToolLoopAgent } from './tool-loop-agent';

describe('createAgentUIStream types', () => {
  it('separates generation and UI message step callbacks', () => {
    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4(),
      tools: {
        weather: tool({
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => ({ location, temperature: 72 }),
        }),
      },
    });

    void createAgentUIStream({
      agent,
      uiMessages: [],
      onStepEnd: event => {
        expectTypeOf(event).toMatchTypeOf<GenerateTextStepEndEvent>();
      },
      onUIMessageStepEnd: event => {
        expectTypeOf(event).toMatchTypeOf<
          Parameters<UIMessageStreamOnStepEndCallback<UIMessage>>[0]
        >();
        expectTypeOf(event.responseMessage).toMatchTypeOf<UIMessage>();
      },
    });
  });
});
