import type { ToolSet } from '@ai-sdk/provider-utils';
import type { ActiveTools } from './active-tools';

type ActiveToolSubset<
  TOOLS extends ToolSet,
  ACTIVE_TOOL_NAMES extends ActiveTools<TOOLS>,
> = [ACTIVE_TOOL_NAMES] extends [NonNullable<ActiveTools<TOOLS>>]
  ? Pick<TOOLS, ACTIVE_TOOL_NAMES[number]>
  : TOOLS;

/**
 * Filters the tools to only include the active tools.
 * When activeTools is provided, we only include the tools that are in the list.
 *
 * @param tools - The tools to filter.
 * @param activeTools - The active tools to include.
 * @returns The filtered tools.
 */
export function filterActiveTools<
  TOOLS extends ToolSet,
  ACTIVE_TOOL_NAMES extends ActiveTools<TOOLS>,
>({
  tools,
  activeTools,
}: {
  tools: TOOLS | undefined;
  activeTools: ACTIVE_TOOL_NAMES;
}): ActiveToolSubset<TOOLS, ACTIVE_TOOL_NAMES> | undefined {
  if (tools == null) {
    return undefined;
  }

  if (activeTools == null) {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) =>
      activeTools.includes(name as keyof TOOLS & string),
    ),
  ) as ActiveToolSubset<TOOLS, ACTIVE_TOOL_NAMES>;
}
