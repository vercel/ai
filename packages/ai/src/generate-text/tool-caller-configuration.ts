import {
  experimental_getToolCaller,
  type Experimental_ToolCallerTool,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

const DIRECT_TOOL_CALL = 'AI_SDK_DIRECT_TOOL_CALL';

type ToolCallerName<TOOLS extends ToolSet> = {
  [NAME in keyof TOOLS]: TOOLS[NAME] extends Experimental_ToolCallerTool
    ? NAME
    : never;
}[keyof TOOLS] &
  string;

export type Experimental_ToolCallers<TOOLS extends ToolSet> = {
  [NAME in keyof TOOLS]?: ReadonlyArray<
    'AI_SDK_DIRECT_TOOL_CALL' | ToolCallerName<TOOLS>
  >;
};

export type ResolvedToolCallers = Record<string, ReadonlyArray<string>>;

export function resolveToolCallerConfiguration<TOOLS extends ToolSet>({
  tools,
  toolCallers,
}: {
  tools: TOOLS | undefined;
  toolCallers: Experimental_ToolCallers<TOOLS> | undefined;
}): ResolvedToolCallers | undefined {
  if (tools == null || toolCallers == null) {
    return undefined;
  }

  const resolved: ResolvedToolCallers = {};

  for (const [toolName, callers] of Object.entries(toolCallers)) {
    if (!Object.prototype.hasOwnProperty.call(tools, toolName)) {
      throw new InvalidArgumentError({
        parameter: 'experimental_toolCallers',
        value: toolCallers,
        message: `unknown tool "${toolName}".`,
      });
    }

    if (!Array.isArray(callers)) {
      throw new InvalidArgumentError({
        parameter: 'experimental_toolCallers',
        value: toolCallers,
        message: `callers for tool "${toolName}" must be an array.`,
      });
    }

    resolved[toolName] = callers.map(caller => {
      if (caller === DIRECT_TOOL_CALL) {
        return caller;
      }

      if (
        typeof caller !== 'string' ||
        !Object.prototype.hasOwnProperty.call(tools, caller) ||
        experimental_getToolCaller(tools[caller]) == null
      ) {
        throw new InvalidArgumentError({
          parameter: 'experimental_toolCallers',
          value: toolCallers,
          message: `tool "${toolName}" contains an invalid caller.`,
        });
      }

      return caller;
    });
  }

  return resolved;
}

export function prepareToolsForToolCallers({
  tools,
  toolCallers,
}: {
  tools: ToolSet | undefined;
  toolCallers: ResolvedToolCallers | undefined;
}): {
  executionTools: ToolSet | undefined;
  modelTools: ToolSet | undefined;
} {
  if (tools == null || toolCallers == null) {
    return { executionTools: tools, modelTools: tools };
  }

  const executionTools: ToolSet = { ...tools };
  const modelTools: ToolSet = { ...tools };
  const localToolsByCaller = new Map<string, ToolSet>();

  for (const [toolName, callerNames] of Object.entries(toolCallers)) {
    const tool = executionTools[toolName];
    if (tool == null) {
      continue;
    }

    let availableDirectly = false;
    let availableToProvider = false;
    let preparedTool: Tool = tool;

    for (const callerName of callerNames) {
      if (callerName === DIRECT_TOOL_CALL) {
        availableDirectly = true;
        continue;
      }

      const caller = experimental_getToolCaller(executionTools[callerName]);
      if (caller == null) {
        continue;
      }

      if (caller.type === 'provider') {
        availableToProvider = true;
        preparedTool = {
          ...preparedTool,
          providerOptions: caller.prepareProviderOptions(
            preparedTool.providerOptions,
          ),
        } as Tool;
      } else {
        const localTools = localToolsByCaller.get(callerName) ?? {};
        localTools[toolName] = preparedTool;
        localToolsByCaller.set(callerName, localTools);
      }
    }

    executionTools[toolName] = preparedTool;

    if (availableDirectly || availableToProvider) {
      modelTools[toolName] = preparedTool;
    } else {
      delete modelTools[toolName];
    }
  }

  for (const [callerName, callerTool] of Object.entries(executionTools)) {
    const caller = experimental_getToolCaller(callerTool);
    if (caller?.type !== 'local') {
      continue;
    }

    const boundCaller = caller.bind(localToolsByCaller.get(callerName) ?? {});
    executionTools[callerName] = boundCaller;

    if (Object.prototype.hasOwnProperty.call(modelTools, callerName)) {
      modelTools[callerName] = boundCaller;
    }
  }

  return { executionTools, modelTools };
}
