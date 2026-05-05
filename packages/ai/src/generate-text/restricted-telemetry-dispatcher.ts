import type {
  Context,
  InferToolContext,
  InferToolSetContext,
  SensitiveContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
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
import { DefaultStepResult, type StepResult } from './step-result';
import type {
  OnToolExecutionEndCallback,
  OnToolExecutionStartCallback,
} from './tool-execution-events';

type IncludedRuntimeContext<CONTEXT extends Context> =
  | { [KEY in keyof CONTEXT]?: boolean }
  | undefined;

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
 * Returns a shallow copy of the runtime context with only top-level
 * properties marked for telemetry inclusion.
 */
function filterIncludedContext<CONTEXT extends Context>({
  context,
  includeContext,
}: {
  context: CONTEXT;
  includeContext: IncludedRuntimeContext<CONTEXT>;
}): Context {
  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => includeContext?.[key as keyof CONTEXT] === true,
    ),
  );
}

/**
 * Returns a shallow copy of the context with top-level properties marked as
 * sensitive removed.
 */
function filterSensitiveContext<CONTEXT extends Context>({
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
 * Creates a copy of a step result whose runtime context only contains
 * top-level properties marked for telemetry inclusion.
 */
function restrictStepResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
>({
  step,
  tools,
  includeRuntimeContext,
}: {
  step: StepResult<TOOLS, RUNTIME_CONTEXT>;
  tools: TOOLS | undefined;
  includeRuntimeContext: IncludedRuntimeContext<RUNTIME_CONTEXT>;
}) {
  return new DefaultStepResult({
    callId: step.callId,
    stepNumber: step.stepNumber,
    provider: step.model.provider,
    modelId: step.model.modelId,
    runtimeContext: filterIncludedContext({
      context: step.runtimeContext,
      includeContext: includeRuntimeContext,
    }),
    toolsContext: filterToolsContext({
      tools,
      toolsContext: step.toolsContext,
    }),
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
 * Returns a shallow copy of the tools context with sensitive top-level
 * properties removed for each tool that marks them as sensitive.
 */
function filterToolsContext<TOOLS extends ToolSet>({
  tools,
  toolsContext,
}: {
  tools: TOOLS | undefined;
  toolsContext: InferToolSetContext<TOOLS>;
}): InferToolSetContext<TOOLS> {
  if (tools == null) {
    return toolsContext;
  }

  return Object.fromEntries(
    Object.entries(toolsContext).map(([toolName, toolContext]) => [
      toolName,
      filterToolContext({
        tools,
        toolName,
        toolContext,
      }),
    ]),
  ) as InferToolSetContext<TOOLS>;
}

function filterToolContext<TOOLS extends ToolSet>({
  tools,
  toolName,
  toolContext,
}: {
  tools: TOOLS | undefined;
  toolName: string;
  toolContext: unknown;
}) {
  const sensitiveToolContext = tools?.[toolName]?.sensitiveContext as
    | SensitiveContext<InferToolContext<TOOLS[typeof toolName]>>
    | undefined;

  return sensitiveToolContext == null
    ? toolContext
    : filterSensitiveContext({
        context: toolContext as InferToolContext<TOOLS[typeof toolName]>,
        sensitiveContext: sensitiveToolContext,
      });
}

/**
 * Creates a telemetry dispatcher that only includes configured runtime context
 * properties in text-generation lifecycle events before dispatching them.
 */
export function createRestrictedTelemetryDispatcher<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  OUTPUT extends Output,
>({
  telemetry,
  tools,
  includeRuntimeContext,
}: {
  telemetry?: TelemetryOptions<RUNTIME_CONTEXT>;
  tools?: TOOLS | undefined;
  includeRuntimeContext: IncludedRuntimeContext<RUNTIME_CONTEXT>;
}): RestrictedTelemetryDispatcher<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  const telemetryDispatcher = createTelemetryDispatcher({ telemetry });

  return {
    ...telemetryDispatcher,
    onStart: event =>
      telemetryDispatcher.onStart?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: includeRuntimeContext,
        }),
        toolsContext: filterToolsContext({
          tools,
          toolsContext: event.toolsContext,
        }),
      }),
    onStepStart: event =>
      telemetryDispatcher.onStepStart?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: includeRuntimeContext,
        }),
        steps: event.steps.map(step =>
          restrictStepResult({ step, tools, includeRuntimeContext }),
        ),
        toolsContext: filterToolsContext({
          tools,
          toolsContext: event.toolsContext,
        }),
      }),
    onStepFinish: event =>
      telemetryDispatcher.onStepFinish?.(
        restrictStepResult({
          step: event,
          tools,
          includeRuntimeContext,
        }),
      ),
    onFinish: event =>
      telemetryDispatcher.onFinish?.({
        ...event,
        runtimeContext: filterIncludedContext({
          context: event.runtimeContext,
          includeContext: includeRuntimeContext,
        }),
        steps: event.steps.map(step =>
          restrictStepResult({ step, tools, includeRuntimeContext }),
        ),
        toolsContext: filterToolsContext({
          tools,
          toolsContext: event.toolsContext,
        }),
      }),
    onToolExecutionStart: event =>
      telemetryDispatcher.onToolExecutionStart?.({
        ...event,
        toolContext: filterToolContext({
          tools,
          toolName: event.toolCall.toolName,
          toolContext: event.toolContext,
        }),
      }),
    onToolExecutionEnd: event =>
      telemetryDispatcher.onToolExecutionEnd?.({
        ...event,
        toolContext: filterToolContext({
          tools,
          toolName: event.toolCall.toolName,
          toolContext: event.toolContext,
        }),
      }),
  };
}
