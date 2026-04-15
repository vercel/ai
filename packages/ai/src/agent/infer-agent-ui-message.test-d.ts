import type { Context } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import {
  CustomContentUIPart,
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  ReasoningFileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  UIMessage,
} from '../ui/ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { createAgentUIStreamResponse } from './create-agent-ui-stream-response';
import { ToolLoopAgent } from './tool-loop-agent';
import { InferAgentUIMessage } from './infer-agent-ui-message';
import { pipeAgentUIStreamToResponse } from './pipe-agent-ui-stream-to-response';

describe('InferAgentUIMessage', () => {
  it('should not contain arbitrary static tools when no tools are provided', () => {
    const agent = new ToolLoopAgent({
      model: 'openai/gpt-4o',
      // no tools
    });

    type Message = InferAgentUIMessage<typeof agent>;

    expectTypeOf<Message>().toMatchTypeOf<UIMessage<unknown, never, {}>>();

    type MessagePart = Message['parts'][number];

    expectTypeOf<MessagePart>().toMatchTypeOf<
      | TextUIPart
      | CustomContentUIPart
      | ReasoningUIPart
      // No static tools, so no ToolUIPart
      | DynamicToolUIPart
      | SourceUrlUIPart
      | SourceDocumentUIPart
      | FileUIPart
      | ReasoningFileUIPart
      | DataUIPart<never>
      | StepStartUIPart
    >();
  });

  it('should include metadata when provided', () => {
    const agent = new ToolLoopAgent({
      model: 'openai/gpt-4o',
      // no tools
    });

    type Message = InferAgentUIMessage<typeof agent, { foo: string }>;

    expectTypeOf<Message>().toMatchTypeOf<
      UIMessage<{ foo: string }, never, {}>
    >();
  });

  it('should include part metadata when provided', () => {
    const agent = new ToolLoopAgent({
      model: 'openai/gpt-4o',
    });

    type Message = InferAgentUIMessage<
      typeof agent,
      unknown,
      { planId: string }
    >;

    type MessagePart = Message['parts'][number];
    type Text = Extract<MessagePart, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<
      { planId: string } | undefined
    >();
  });

  it('should default part metadata to unknown when not specified', () => {
    const agent = new ToolLoopAgent({
      model: 'openai/gpt-4o',
    });

    type Message = InferAgentUIMessage<typeof agent, { foo: string }>;

    type MessagePart = Message['parts'][number];
    type Text = Extract<MessagePart, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<unknown | undefined>();
  });

  it('should type createAgentUIStream partMetadata to the UI message part metadata', () => {
    type Options = Parameters<
      typeof createAgentUIStream<
        never,
        {},
        Context,
        never,
        { requestId: string },
        { planId: string }
      >
    >[0];

    type PartMetadataReturn = ReturnType<NonNullable<Options['partMetadata']>>;

    expectTypeOf<PartMetadataReturn>().toEqualTypeOf<
      { planId: string } | undefined
    >();
  });

  it('should type createAgentUIStreamResponse partMetadata to the UI message part metadata', () => {
    type Options = Parameters<
      typeof createAgentUIStreamResponse<
        never,
        {},
        Context,
        never,
        { requestId: string },
        { planId: string }
      >
    >[0];

    type PartMetadataReturn = ReturnType<NonNullable<Options['partMetadata']>>;

    expectTypeOf<PartMetadataReturn>().toEqualTypeOf<
      { planId: string } | undefined
    >();
  });

  it('should type pipeAgentUIStreamToResponse partMetadata to the UI message part metadata', () => {
    type Options = Parameters<
      typeof pipeAgentUIStreamToResponse<
        never,
        {},
        Context,
        never,
        { requestId: string },
        { planId: string }
      >
    >[0];

    type PartMetadataReturn = ReturnType<NonNullable<Options['partMetadata']>>;

    expectTypeOf<PartMetadataReturn>().toEqualTypeOf<
      { planId: string } | undefined
    >();
  });
});
