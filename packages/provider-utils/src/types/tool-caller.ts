import type { ProviderOptions } from './provider-options';
import type { Tool } from './tool';
import type { ToolSet } from './tool-set';

const toolCallerSymbol = Symbol.for('vercel.ai.experimental.toolCaller');

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
  readonly [toolCallerSymbol]: ToolCallerDefinition;
};

export function toolCaller<TOOL extends Tool>(
  tool: TOOL,
  definition: ToolCallerDefinition,
): ToolCallerTool<TOOL> {
  return Object.defineProperty({ ...tool }, toolCallerSymbol, {
    value: definition,
  }) as ToolCallerTool<TOOL>;
}

export function getToolCaller(
  tool: Tool | undefined,
): ToolCallerDefinition | undefined {
  return (tool as ToolCallerTool | undefined)?.[toolCallerSymbol];
}
