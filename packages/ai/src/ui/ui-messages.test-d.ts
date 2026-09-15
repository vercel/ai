import { describe, expectTypeOf, it } from 'vitest';
import {
  isToolOutputErrorUIPart,
  type DynamicToolUIPart,
  type ToolOutputErrorUIPart,
  type ToolUIPart,
  type UIMessagePart,
} from './ui-messages';

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
  it('allows dynamic input-streaming tool parts with optional input', () => {
    type Part = {
      type: 'dynamic-tool';
      state: 'input-streaming';
      toolCallId: string;
      toolName: string;
      input?: unknown;
      providerExecuted?: boolean;
    };

    type _ = AssertAssignable<DynamicToolUIPart, Part>;
  });

  it('allows static input-streaming tool parts with optional input', () => {
    type Part = {
      type: 'tool-weather';
      state: 'input-streaming';
      toolCallId: string;
      input?: {
        city?: string;
      };
      providerExecuted?: boolean;
    };

    type _ = AssertAssignable<ToolUIPart<TestTools>, Part>;
  });

  it('allows static input-streaming tool parts with explicit undefined input', () => {
    type Part = {
      type: 'tool-weather';
      state: 'input-streaming';
      toolCallId: 'call-1';
      input: undefined;
    };

    type _ = AssertAssignable<ToolUIPart<TestTools>, Part>;
  });

  it('keeps approval request and response reasons distinct', () => {
    type RequestedPart = {
      type: 'tool-weather';
      state: 'approval-requested';
      toolCallId: 'call-1';
      input: { city: 'Tokyo' };
      approval: {
        id: 'approval-1';
        descriptor: {
          action: 'getWeather';
        };
        requestReason: 'requires operator review';
      };
    };
    type _Requested = AssertAssignable<ToolUIPart<TestTools>, RequestedPart>;

    type RespondedPart = {
      type: 'tool-weather';
      state: 'approval-responded';
      toolCallId: 'call-1';
      input: { city: 'Tokyo' };
      approval: {
        id: 'approval-1';
        approved: true;
        descriptor: {
          action: 'getWeather';
        };
        requestReason: 'requires operator review';
        reason: 'approved by operator';
      };
    };
    type _Responded = AssertAssignable<ToolUIPart<TestTools>, RespondedPart>;
  });
});

describe('ToolOutputErrorUIPart', () => {
  it('represents static and dynamic tool output errors', () => {
    type StaticPart = {
      type: 'tool-weather';
      state: 'output-error';
      toolCallId: 'call-1';
      input: { city: 'Tokyo' };
      errorText: 'Weather service unavailable';
    };
    type _Static = AssertAssignable<
      ToolOutputErrorUIPart<TestTools>,
      StaticPart
    >;

    type DynamicPart = {
      type: 'dynamic-tool';
      toolName: 'weather';
      state: 'output-error';
      toolCallId: 'call-2';
      input: { city: 'Tokyo' };
      errorText: 'Weather service unavailable';
    };
    type _Dynamic = AssertAssignable<
      ToolOutputErrorUIPart<TestTools>,
      DynamicPart
    >;
  });

  it('narrows tool output errors while preserving static tool input types', () => {
    const part = null as unknown as UIMessagePart<
      Record<string, never>,
      TestTools
    >;

    if (isToolOutputErrorUIPart(part)) {
      expectTypeOf(part).toEqualTypeOf<ToolOutputErrorUIPart<TestTools>>();
      expectTypeOf(part.errorText).toEqualTypeOf<string>();

      if (part.type === 'tool-weather') {
        expectTypeOf(part.input).toEqualTypeOf<
          TestTools['weather']['input'] | undefined
        >();
      }
    }
  });
});
