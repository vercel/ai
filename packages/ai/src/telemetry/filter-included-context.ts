import type {
  Context,
  InferToolContext,
  InferToolSetContext,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  IncludedContext,
  IncludedToolsContext,
} from './telemetry-options';

/**
 * Returns a shallow copy of the runtime context with only top-level
 * properties marked for telemetry inclusion.
 */
export function filterIncludedContext<CONTEXT extends Context>({
  context,
  includeContext,
}: {
  context: CONTEXT;
  includeContext: IncludedContext<CONTEXT>;
}): Context {
  if (context == null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context).filter(
      ([key]) => includeContext?.[key as keyof CONTEXT] === true,
    ),
  );
}

export function filterToolsContext<TOOLS extends ToolSet>({
  toolsContext,
  includeToolsContext,
}: {
  toolsContext: InferToolSetContext<TOOLS>;
  includeToolsContext: IncludedToolsContext<TOOLS>;
}): InferToolSetContext<TOOLS> {
  if (includeToolsContext == null) {
    return {} as InferToolSetContext<TOOLS>;
  }

  return Object.fromEntries(
    Object.entries(toolsContext).map(([toolName, toolContext]) => [
      toolName,
      filterToolContext({
        toolName,
        toolContext,
        includeToolsContext,
      }),
    ]),
  ) as InferToolSetContext<TOOLS>;
}

export function filterToolContext<TOOLS extends ToolSet>({
  toolName,
  toolContext,
  includeToolsContext,
}: {
  toolName: string;
  toolContext: unknown;
  includeToolsContext: IncludedToolsContext<TOOLS>;
}) {
  const includeToolContext = (
    includeToolsContext as
      | Record<
          string,
          IncludedContext<InferToolContext<TOOLS[typeof toolName]>>
        >
      | undefined
  )?.[toolName];

  return filterIncludedContext({
    context: toolContext as InferToolContext<TOOLS[typeof toolName]>,
    includeContext: includeToolContext,
  });
}
