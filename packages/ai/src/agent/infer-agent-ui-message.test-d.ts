import { describe, expectTypeOf, it } from 'vitest';
import {
  DataUIPart,
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceExecutionFileUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  UIMessage,
} from '../ui/ui-messages';
import { BasicAgent } from './basic-agent';
import { InferAgentUIMessage } from './infer-agent-ui-message';

describe('InferAgentUIMessage', () => {
  it('should not contain arbitrary static tools when no tools are provided', () => {
    const baseAgent = new BasicAgent({
      model: 'openai/gpt-4o',
      // no tools
    });

    type Message = InferAgentUIMessage<typeof baseAgent>;

    expectTypeOf<Message>().toMatchTypeOf<UIMessage<never, never, {}>>();

    type MessagePart = Message['parts'][number];

    expectTypeOf<MessagePart>().toMatchTypeOf<
      | TextUIPart
      | ReasoningUIPart
      // No static tools, so no ToolUIPart
      | DynamicToolUIPart
      | SourceUrlUIPart
      | SourceDocumentUIPart
      | SourceExecutionFileUIPart
      | FileUIPart
      | DataUIPart<never>
      | StepStartUIPart
    >();
  });
});
