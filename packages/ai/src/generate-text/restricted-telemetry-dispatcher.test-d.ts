import type { ToolSet } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import type { Callback } from '../util/callback';
import type {
  GenerateTextEndEvent,
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
  GenerateTextStartEvent,
} from './generate-text-events';
import type { Output } from './output';
import { createRestrictedTelemetryDispatcher } from './restricted-telemetry-dispatcher';

describe('createRestrictedTelemetryDispatcher types', () => {
  type RuntimeContext = {
    userId: string;
    requestId: string;
  };

  const telemetryDispatcher = createRestrictedTelemetryDispatcher<
    ToolSet,
    RuntimeContext,
    Output
  >({
    sensitiveRuntimeContext: { userId: true },
  });

  it('exposes text telemetry callbacks with the original runtimeContext type', () => {
    expectTypeOf(telemetryDispatcher.onStart).toMatchTypeOf<
      | Callback<GenerateTextStartEvent<ToolSet, RuntimeContext, Output>>
      | undefined
    >();
    expectTypeOf(telemetryDispatcher.onStepStart).toMatchTypeOf<
      | Callback<GenerateTextStepStartEvent<ToolSet, RuntimeContext, Output>>
      | undefined
    >();
    expectTypeOf(telemetryDispatcher.onStepFinish).toMatchTypeOf<
      Callback<GenerateTextStepEndEvent<ToolSet, RuntimeContext>> | undefined
    >();
    expectTypeOf(telemetryDispatcher.onFinish).toMatchTypeOf<
      Callback<GenerateTextEndEvent<ToolSet, RuntimeContext>> | undefined
    >();
  });
});
