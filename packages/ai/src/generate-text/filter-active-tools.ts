import type { ToolSet } from './tool-set';

export function filterActiveTools<TOOLS extends ToolSet>({
  tools,
  activeTools,
}: {
  tools: TOOLS | undefined;
  activeTools: Array<keyof TOOLS> | undefined;
}): TOOLS | undefined {
  if (tools == null || activeTools == null) {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) =>
      activeTools.includes(name as keyof TOOLS),
    ),
  ) as TOOLS;
}
