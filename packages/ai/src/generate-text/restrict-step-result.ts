import type {
  Context,
  RestrictedContext,
  SensitiveContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import { filterContext } from '@ai-sdk/provider-utils';
import { DefaultStepResult, StepResult } from './step-result';

export function restrictStepResult<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context,
  SENSITIVE_RUNTIME_CONTEXT extends SensitiveContext<RUNTIME_CONTEXT>,
>({
  step,
  sensitiveRuntimeContext,
}: {
  step: StepResult<TOOLS, RUNTIME_CONTEXT>;
  sensitiveRuntimeContext: SENSITIVE_RUNTIME_CONTEXT;
}): StepResult<
  TOOLS,
  RestrictedContext<RUNTIME_CONTEXT, SENSITIVE_RUNTIME_CONTEXT>
> {
  const restrictedRuntimeContext = filterContext({
    context: step.runtimeContext,
    sensitiveContext: sensitiveRuntimeContext,
  });

  return new DefaultStepResult<
    TOOLS,
    RestrictedContext<RUNTIME_CONTEXT, SENSITIVE_RUNTIME_CONTEXT>
  >({
    callId: step.callId,
    stepNumber: step.stepNumber,
    provider: step.model.provider,
    modelId: step.model.modelId,
    runtimeContext: restrictedRuntimeContext,
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
