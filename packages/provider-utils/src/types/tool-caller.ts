import type { ProviderOptions } from './provider-options';
import type { Tool } from './tool';
import type { ToolSet } from './tool-set';

export type ToolCallerDefinition =
  | {
      type: 'local';
      bind: (tools: ToolSet) => Tool;
    }
  | {
      type: 'provider';
      prepareProviderOptions: (
        providerOptions: ProviderOptions | undefined,
      ) => ProviderOptions;
    };

export type ToolCallerTool<TOOL extends Tool = Tool> = TOOL & {
  readonly experimental_toolCaller: ToolCallerDefinition;
};

export function toolCaller<TOOL extends Tool>(
  tool: TOOL,
  definition: ToolCallerDefinition,
): ToolCallerTool<TOOL> {
  return Object.defineProperty({ ...tool }, 'experimental_toolCaller', {
    value: definition,
  }) as ToolCallerTool<TOOL>;
}

export function getToolCaller(
  tool: Tool | undefined,
): ToolCallerDefinition | undefined {
  return (tool as ToolCallerTool | undefined)?.experimental_toolCaller;
}
