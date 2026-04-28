import type {
  Context,
  SensitiveContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { filterContext } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from '../telemetry/create-telemetry-dispatcher';
import type { TelemetryDispatcher } from '../telemetry/telemetry';
import type { TelemetryOptions } from '../telemetry/telemetry-options';
import type {
  GenerateTextOnFinishCallback,
  GenerateTextOnStartCallback,
  GenerateTextOnStepFinishCallback,
  GenerateTextOnStepStartCallback,
} from './generate-text-events';
import type { Output } from './output';
import { DefaultStepResult, StepResult } from './step-result';
import type {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';

type RestrictedTelemetryDispatcher<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
> = Omit<
  TelemetryDispatcher,
  | 'onStart'
  | 'onStepStart'
  | 'onStepFinish'
  | 'onFinish'
  | 'onToolExecutionStart'
  | 'onToolExecutionEnd'
> & {
  onStart?: GenerateTextOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onStepStart?: GenerateTextOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onStepFinish?: GenerateTextOnStepFinishCallback<TOOLS, RUNTIME_CONTEXT>;
  onFinish?: GenerateTextOnFinishCallback<TOOLS, RUNTIME_CONTEXT>;
  onToolExecutionStart?: OnToolExecutionStartCallback<TOOLS>;
  onToolExecutionEnd?: OnToolExecutionEndCallback<TOOLS>;
};

function restrictStepResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
>({
  step,
  sensitiveRuntimeContext,
}: {
  step: StepResult<TOOLS, RUNTIME_CONTEXT>;
  sensitiveRuntimeContext: SensitiveContext<RUNTIME_CONTEXT>;
}) {
  return new DefaultStepResult({
    callId: step.callId,
    stepNumber: step.stepNumber,
    provider: step.model.provider,
    modelId: step.model.modelId,
    runtimeContext: filterContext({
      context: step.runtimeContext,
      sensitiveContext: sensitiveRuntimeContext,
    }),
    toolsContext: step.toolsContext,
    content: step.content,
    finishReason: step.finishReason,
    rawFinishReason: step.rawFinishReason,
    usage: step.usage,
    warnings: step.warnings,
    request: step.request,
    response: step.response,
    providerMetadata: step.providerMetadata,
  });
}

export function createRestrictedTelemetryDispatcher<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
>({
  telemetry,
  sensitiveRuntimeContext,
}: {
  telemetry?: TelemetryOptions;
  sensitiveRuntimeContext: SensitiveContext<RUNTIME_CONTEXT>;
}): RestrictedTelemetryDispatcher<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...telemetryDispatcher,
    onStart: event =>
      telemetryDispatcher.onStart?.({
        ...event,
        runtimeContext: filterContext({
          context: event.runtimeContext,
          sensitiveContext: sensitiveRuntimeContext,
        }),
      } as Parameters<NonNullable<TelemetryDispatcher['onStart']>>[0]),
    onStepStart: event =>
      telemetryDispatcher.onStepStart?.({
        ...event,
        runtimeContext: filterContext({
          context: event.runtimeContext,
          sensitiveContext: sensitiveRuntimeContext,
        }),
        steps: event.steps.map(step =>
          restrictStepResult({ step, sensitiveRuntimeContext }),
        ),
      } as Parameters<NonNullable<TelemetryDispatcher['onStepStart']>>[0]),
    onStepFinish: event =>
      telemetryDispatcher.onStepFinish?.(
        restrictStepResult({
          step: event,
          sensitiveRuntimeContext,
        }) as Parameters<NonNullable<TelemetryDispatcher['onStepFinish']>>[0],
      ),
    onFinish: event =>
      telemetryDispatcher.onFinish?.({
        ...event,
        runtimeContext: filterContext({
          context: event.runtimeContext,
          sensitiveContext: sensitiveRuntimeContext,
        }),
        steps: event.steps.map(step =>
          restrictStepResult({ step, sensitiveRuntimeContext }),
        ),
      } as Parameters<NonNullable<TelemetryDispatcher['onFinish']>>[0]),
  };
}
