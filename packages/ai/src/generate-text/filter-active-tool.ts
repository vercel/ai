import type { ToolSet } from '@ai-sdk/provider-utils';
import { LOAD_TOOL_SCHEMA_NAME } from './load-tool-schema';

type ActiveTools<
  TOOLS extends ToolSet,
  ACTIVE_TOOL_NAMES extends readonly (keyof TOOLS)[] | undefined,
> = [ACTIVE_TOOL_NAMES] extends [readonly (keyof TOOLS)[]]
  ? Pick<TOOLS, ACTIVE_TOOL_NAMES[number]>
  : TOOLS;

/**
 * Filters the tools to only include the active tools.
 * When activeTools is provided, we only include the tools that are in the list.
 * The __load_tool_schema__ tool is always preserved when present, so that
 * lazy tool discovery is not silently broken by activeTools filtering.
 *
 * @param tools - The tools to filter.
 * @param activeTools - The active tools to include.
 * @returns The filtered tools.
 */
export function filterActiveTools<
  TOOLS extends ToolSet,
  ACTIVE_TOOL_NAMES extends readonly (keyof TOOLS)[] | undefined,
>({
  tools,
  activeTools,
}: {
  tools: TOOLS | undefined;
  activeTools: ACTIVE_TOOL_NAMES;
}): ActiveTools<TOOLS, ACTIVE_TOOL_NAMES> | undefined {
  if (tools == null) {
    return undefined;
  }

  if (activeTools == null) {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).filter(
      ([name]) =>
        name === LOAD_TOOL_SCHEMA_NAME ||
        activeTools.includes(name as keyof TOOLS),
    ),
  ) as ActiveTools<TOOLS, ACTIVE_TOOL_NAMES>;
}
