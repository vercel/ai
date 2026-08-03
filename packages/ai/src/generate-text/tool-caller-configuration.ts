import {
  experimental_getToolCaller,
  experimental_toolCaller,
  type Experimental_ToolCallerDefinition,
  type Experimental_ToolWithCaller,
  type Tool,
  type ToolCall,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { maybeSignApproval } from './tool-approval-signature';
import type { ToolApprovalRequestOutput } from './tool-approval-request-output';
import type { TypedToolCall } from './tool-call';

const DIRECT_TOOL_CALL = 'AI_SDK_DIRECT_TOOL_CALL';

type LocalToolCallerDefinition = Extract<
  Experimental_ToolCallerDefinition,
  { type: 'local' }
>;
type LocalToolCallerApprovalStatus = Awaited<
  ReturnType<
    Parameters<LocalToolCallerDefinition['bind']>[1]['resolveToolApproval']
  >
>;
export type LocalToolCallerApprovalRequest = Exclude<
  ReturnType<NonNullable<LocalToolCallerDefinition['getApprovalRequest']>>,
  undefined
>;

type ToolCallerName<TOOLS extends ToolSet> = {
  [NAME in keyof TOOLS]: TOOLS[NAME] extends Experimental_ToolWithCaller
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

export function prepareToolsForToolCallers<TOOLS extends ToolSet>({
  tools,
  toolCallers,
  resolveToolApproval,
}: {
  tools: TOOLS | undefined;
  toolCallers: ResolvedToolCallers | undefined;
  resolveToolApproval?: (
    toolCall: ToolCall<string, unknown>,
  ) => Promise<LocalToolCallerApprovalStatus>;
}): {
  executionTools: TOOLS | undefined;
  modelTools: TOOLS | undefined;
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

    const boundCaller = experimental_toolCaller(
      caller.bind(localToolsByCaller.get(callerName) ?? {}, {
        resolveToolApproval:
          resolveToolApproval ??
          (async () => ({ type: 'not-applicable' as const })),
      }),
      caller,
    );
    executionTools[callerName] = boundCaller;

    if (Object.prototype.hasOwnProperty.call(modelTools, callerName)) {
      modelTools[callerName] = boundCaller;
    }
  }

  return {
    executionTools: executionTools as TOOLS,
    modelTools: modelTools as TOOLS,
  };
}

export function getToolCallerApprovalRequest({
  callerToolName,
  output,
  tools,
}: {
  callerToolName: string;
  output: unknown;
  tools: ToolSet | undefined;
}): LocalToolCallerApprovalRequest | undefined {
  const caller = experimental_getToolCaller(tools?.[callerToolName]);
  return caller?.type === 'local'
    ? caller.getApprovalRequest?.(output)
    : undefined;
}

export async function createToolCallerApprovalRequestOutput<
  TOOLS extends ToolSet,
>({
  request,
  toolApprovalSecret,
}: {
  request: LocalToolCallerApprovalRequest;
  toolApprovalSecret: string | Uint8Array | undefined;
}): Promise<ToolApprovalRequestOutput<TOOLS>> {
  const toolCall = {
    type: 'tool-call' as const,
    ...request.toolCall,
    dynamic: false as const,
  } as TypedToolCall<TOOLS>;
  const signature = await maybeSignApproval({
    secret: toolApprovalSecret,
    approvalId: request.approvalId,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
  });
  return {
    type: 'tool-approval-request',
    approvalId: request.approvalId,
    toolCall,
    ...(signature != null ? { signature } : {}),
  };
}

export function getLocalToolsForCaller({
  callerName,
  tools,
  toolCallers,
}: {
  callerName: string;
  tools: ToolSet;
  toolCallers: ResolvedToolCallers | undefined;
}): ToolSet {
  if (toolCallers == null) {
    return {};
  }
  const localTools: ToolSet = {};
  for (const [toolName, callers] of Object.entries(toolCallers)) {
    if (callers.includes(callerName) && tools[toolName] != null) {
      localTools[toolName] = tools[toolName];
    }
  }
  return localTools;
}
