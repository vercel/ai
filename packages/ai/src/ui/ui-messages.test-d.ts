import { describe, it } from 'vitest';
import type { DynamicToolUIPart, ToolUIPart } from './ui-messages';

type TestTools = {
  weather: {
    input: {
      city: string;
    };
    output: string;
  };
};

type AssertAssignable<Target, Source extends Target> = Source;

describe('UIMessagePart', () => {
  it('allows resumable input-streaming tool parts with raw input text', () => {
    type StaticPart = {
      type: 'tool-weather';
      state: 'input-streaming';
      toolCallId: 'static-call';
      input: {
        city: 'San';
      };
      rawInput: '{"city":"San';
    };
    type _Static = AssertAssignable<ToolUIPart<TestTools>, StaticPart>;

    type DynamicPart = {
      type: 'dynamic-tool';
      state: 'input-streaming';
      toolCallId: 'dynamic-call';
      toolName: 'weather';
      input: {
        city: 'San';
      };
      rawInput: '{"city":"San';
    };
    type _Dynamic = AssertAssignable<DynamicToolUIPart, DynamicPart>;
  });
});
