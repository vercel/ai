import {
  experimental_getToolCaller,
  type Experimental_ToolCallerTool,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';

export interface Experimental_ToolCallerReference<
  NAME extends string = string,
> {
  readonly toolName: NAME;
}

type ToolCallerName<TOOLS extends ToolSet> = {
  [NAME in keyof TOOLS]: TOOLS[NAME] extends Experimental_ToolCallerTool
    ? NAME
    : never;
}[keyof TOOLS] &
  string;

type ToolCallerReferenceUnion<TOOLS extends ToolSet> = {
  [NAME in ToolCallerName<TOOLS>]: Experimental_ToolCallerReference<NAME>;
}[ToolCallerName<TOOLS>];

export type Experimental_ToolCallers<TOOLS extends ToolSet> = (callers: {
  [NAME in ToolCallerName<TOOLS>]: Experimental_ToolCallerReference<NAME>;
}) => {
  [NAME in keyof TOOLS]?: ReadonlyArray<
    'direct' | ToolCallerReferenceUnion<TOOLS>
  >;
};

export type ResolvedToolCallers = Record<
  string,
  ReadonlyArray<'direct' | string>
>;

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

  const namesByReference = new WeakMap<object, string>();
  const callerReferences: Record<string, Experimental_ToolCallerReference> = {};

  for (const [toolName, tool] of Object.entries(tools)) {
    if (experimental_getToolCaller(tool) == null) {
      continue;
    }

    const reference = Object.freeze({ toolName });
    namesByReference.set(reference, toolName);
    callerReferences[toolName] = reference;
  }

  const configuration = toolCallers(callerReferences as never);
  const resolved: ResolvedToolCallers = {};

  for (const [toolName, callers] of Object.entries(configuration)) {
    if (!Object.prototype.hasOwnProperty.call(tools, toolName)) {
      throw new InvalidArgumentError({
        parameter: 'experimental_toolCallers',
        value: configuration,
        message: `unknown tool "${toolName}".`,
      });
    }

    if (!Array.isArray(callers)) {
      throw new InvalidArgumentError({
        parameter: 'experimental_toolCallers',
        value: configuration,
        message: `callers for tool "${toolName}" must be an array.`,
      });
    }

    resolved[toolName] = callers.map(caller => {
      if (caller === 'direct') {
        return caller;
      }

      const callerName =
        caller != null && typeof caller === 'object'
          ? namesByReference.get(caller)
          : undefined;

      if (callerName == null) {
        throw new InvalidArgumentError({
          parameter: 'experimental_toolCallers',
          value: configuration,
          message: `tool "${toolName}" contains an invalid caller reference.`,
        });
      }

      return callerName;
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
      if (callerName === 'direct') {
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
