import type { Context, ToolSet } from '@ai-sdk/provider-utils';
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
import { SensitiveContext } from './sensitive-context';
import { DefaultStepResult, StepResult } from './step-result';
import type {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';

/**
 * Telemetry dispatcher for text generation with callbacks typed to the
 * operation-specific tool set, runtime context, and output shape.
 */
export type RestrictedTelemetryDispatcher<
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
  onStart: GenerateTextOnStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onStepStart: GenerateTextOnStepStartCallback<TOOLS, RUNTIME_CONTEXT, OUTPUT>;
  onStepFinish: GenerateTextOnStepFinishCallback<TOOLS, RUNTIME_CONTEXT>;
  onFinish: GenerateTextOnFinishCallback<TOOLS, RUNTIME_CONTEXT>;
  onToolExecutionStart?: OnToolExecutionStartCallback<TOOLS>;
  onToolExecutionEnd?: OnToolExecutionEndCallback<TOOLS>;
};

/**
 * Returns a shallow copy of the runtime context with top-level properties
 * marked as sensitive removed.
 */
function filterContext<CONTEXT extends Context>({
  context,
  sensitiveContext,
}: {
  context: CONTEXT;
  sensitiveContext: SensitiveContext<CONTEXT>;
}): Context {
  return sensitiveContext == null
    ? context
    : Object.fromEntries(
        Object.entries(context).filter(
          ([key]) => sensitiveContext[key as keyof CONTEXT] !== true,
        ),
      );
}

/**
 * Creates a copy of a step result whose runtime context has sensitive
 * top-level properties removed before it is sent to telemetry integrations.
 */
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

/**
 * Creates a telemetry dispatcher that redacts configured runtime context
 * properties from text-generation lifecycle events before dispatching them.
 */
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
      }),
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
      }),
    onStepFinish: event =>
      telemetryDispatcher.onStepFinish?.(
        restrictStepResult({
          step: event,
          sensitiveRuntimeContext,
        }),
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
      }),
  };
}
