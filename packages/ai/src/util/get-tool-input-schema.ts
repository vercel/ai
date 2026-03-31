import type { FlexibleSchema } from '@ai-sdk/provider-utils';

type ToolWithLegacyParameters<INPUT = unknown> = {
  inputSchema?: FlexibleSchema<INPUT>;
  parameters?: FlexibleSchema<INPUT>;
};

export function getToolInputSchema<INPUT>(
  tool: ToolWithLegacyParameters<INPUT>,
): FlexibleSchema<INPUT> | undefined {
  return tool.inputSchema ?? tool.parameters;
}
