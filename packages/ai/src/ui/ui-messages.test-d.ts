import { describe, it } from 'vitest';
import type { ToolUIPart } from './ui-messages';

type TestTools = {
  weather: {
    input: {
      city: string;
      units?: 'celsius' | 'fahrenheit';
    };
    output: string;
  };
};

type AssertAssignable<Target, Source extends Target> = Source;

describe('UIMessagePart', () => {
  it('keeps deprecated rawInput assignable on static output-error tool parts', () => {
    type Part = {
      type: 'tool-weather';
      state: 'output-error';
      toolCallId: 'call-1';
      input: undefined;
      rawInput: '{"city":';
      errorText: 'Invalid tool input';
    };

    type _ = AssertAssignable<ToolUIPart<TestTools>, Part>;
  });
});
