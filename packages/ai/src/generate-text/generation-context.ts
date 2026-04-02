import type { Context } from '@ai-sdk/provider-utils';
import type { InferToolSetContext } from '@ai-sdk/provider-utils';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * The context type for a generation call.
 *
 * It expands the tool set context with the generic context type for
 * e.g. prepareStep or telemetry,
 * while keeping the inferred tool set context for autocompletion.
 */
export type GenerationContext<TOOLS extends ToolSet> = InferToolSetContext<
  NoInfer<TOOLS>
> &
  Context;
