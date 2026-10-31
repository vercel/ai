import {
  UnsupportedFunctionalityError,
  type JSONObject,
  type LanguageModelV3CallOptions,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  prepareTools as prepareAnthropicTools,
} from '@ai-sdk/anthropic/internal';
import {
  isAnthropicModel as detectAnthropicModel,
  supportsStrictTools,
} from './bedrock-anthropic-model-support';
import type {
  BedrockTool,
  BedrockToolConfiguration,
} from './bedrock-api-types';
import type { AmazonBedrockChatModelSettings } from './bedrock-chat-options';

export async function prepareTools({
  tools,
  toolChoice,
  modelId,
  modelFamily,
  reasoningBudgetTokens,
  disableParallelToolUse,
  rejectsForcedToolUse = false,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
  modelId: string;
  modelFamily?: AmazonBedrockChatModelSettings['modelFamily'];
  reasoningBudgetTokens?: number;
  disableParallelToolUse?: boolean;
  rejectsForcedToolUse?: boolean;
}): Promise<{
  toolConfig: BedrockToolConfiguration;
  additionalTools: Record<string, unknown> | undefined;
  betas: Set<string>;
  toolWarnings: SharedV3Warning[];
}> {
  const toolWarnings: SharedV3Warning[] = [];
  const betas = new Set<string>();

  if (tools == null || tools.length === 0) {
    return {
      toolConfig: {},
      additionalTools: undefined,
      betas,
      toolWarnings,
    };
  }

  // Filter out unsupported web_search tool and add a warning
  const supportedTools = tools.filter(tool => {
    if (
      tool.type === 'provider' &&
      tool.id === 'anthropic.web_search_20250305'
    ) {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'web_search_20250305 tool',
        details:
          'The web_search_20250305 tool is not supported on Amazon Bedrock.',
      });
      return false; // Exclude this tool
    }
    return true; // Include all other tools
  });

  if (supportedTools.length === 0) {
    return {
      toolConfig: {},
      additionalTools: undefined,
      betas,
      toolWarnings,
    };
  }

  const isAnthropicModel = detectAnthropicModel({
    modelId,
    modelFamily,
    reasoningBudgetTokens,
  });
  const providerTools = supportedTools.filter(t => t.type === 'provider');
  const functionTools = supportedTools.filter(t => t.type === 'function');
  const rejectsForcedToolChoice =
    isAnthropicModel &&
    rejectsForcedToolUse &&
    (toolChoice?.type === 'required' || toolChoice?.type === 'tool');
  const providerToolsForRequest =
    rejectsForcedToolChoice && toolChoice.type === 'tool'
      ? providerTools.filter(tool => tool.name === toolChoice.toolName)
      : providerTools;

  let additionalTools: Record<string, unknown> | undefined = undefined;
  const bedrockTools: BedrockTool[] = [];

  const usingAnthropicTools =
    isAnthropicModel && providerToolsForRequest.length > 0;

  // Handle Anthropic provider-defined tools for Anthropic models on Bedrock
  if (usingAnthropicTools) {
    const {
      toolChoice: preparedAnthropicToolChoice,
      toolWarnings: anthropicToolWarnings,
      betas: anthropicBetas,
    } = await prepareAnthropicTools({
      tools: providerTools,
      toolChoice,
      disableParallelToolUse,
      supportsStructuredOutput: false,
      supportsStrictTools: false,
      rejectsForcedToolUse,
    });

    toolWarnings.push(...anthropicToolWarnings);
    anthropicBetas.forEach(beta => betas.add(beta));

    // For Anthropic tools on Bedrock, only the 'tool_choice' goes into additional fields.
    // The tool definitions themselves are sent in the standard 'toolConfig'.
    if (preparedAnthropicToolChoice) {
      additionalTools = {
        tool_choice: preparedAnthropicToolChoice,
      };
    }

    // Create a standard Bedrock tool representation for validation purposes
    for (const tool of providerToolsForRequest) {
      const toolFactory = Object.values(anthropicTools).find(factory => {
        const instance = (factory as (args: any) => any)({});
        return instance.id === tool.id;
      });

      if (toolFactory != null) {
        const fullToolDefinition = (toolFactory as (args: any) => any)({});
        bedrockTools.push({
          toolSpec: {
            name: tool.name,
            inputSchema: {
              json: (await asSchema(fullToolDefinition.inputSchema)
                .jsonSchema) as JSONObject,
            },
          },
        });
      } else {
        toolWarnings.push({ type: 'unsupported', feature: 'tool ${tool.id}' });
      }
    }
  } else {
    // Report unsupported provider-defined tools for non-anthropic models
    for (const tool of providerToolsForRequest) {
      toolWarnings.push({ type: 'unsupported', feature: `tool ${tool.id}` });
    }
  }

  let preparedToolChoice = toolChoice;
  if (!usingAnthropicTools && rejectsForcedToolChoice) {
    if (toolChoice.type === 'tool') {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'toolChoice',
        details:
          `toolChoice 'tool' is not supported by this model because it rejects forced tool use. ` +
          `Only the '${toolChoice.toolName}' tool is sent with 'auto' tool choice. ` +
          `Instruct the model to use the tool in the prompt and verify that a tool call was made.`,
      });
    } else {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'toolChoice',
        details:
          `toolChoice 'required' is not supported by this model because it rejects forced tool use. ` +
          `Using 'auto' instead. Instruct the model to use a tool in the prompt and verify that a tool call was made.`,
      });
    }
    preparedToolChoice = { type: 'auto' };
  }

  const filteredFunctionTools =
    toolChoice?.type === 'tool'
      ? functionTools.filter(t => t.name === toolChoice.toolName)
      : functionTools;

  const supportsStrictOnTools = supportsStrictTools(modelId);

  for (const tool of filteredFunctionTools) {
    if (!supportsStrictOnTools && tool.strict != null) {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'strict',
        details: `Tool '${tool.name}' has strict: ${tool.strict}, but strict mode is not supported by this model on Amazon Bedrock. The strict property will be ignored.`,
      });
    }

    bedrockTools.push({
      toolSpec: {
        name: tool.name,
        ...(tool.description?.trim() !== ''
          ? { description: tool.description }
          : {}),
        ...(tool.strict != null && supportsStrictOnTools
          ? { strict: tool.strict }
          : {}),
        inputSchema: {
          json: tool.inputSchema as JSONObject,
        },
      },
    });
  }

  if (
    isAnthropicModel &&
    !usingAnthropicTools &&
    disableParallelToolUse &&
    bedrockTools.length > 0 &&
    preparedToolChoice?.type !== 'none'
  ) {
    additionalTools = {
      tool_choice:
        preparedToolChoice?.type === 'required'
          ? { type: 'any', disable_parallel_tool_use: true }
          : preparedToolChoice?.type === 'tool'
            ? {
                type: 'tool',
                name: preparedToolChoice.toolName,
                disable_parallel_tool_use: true,
              }
            : { type: 'auto', disable_parallel_tool_use: true },
    };
  }

  // Handle toolChoice for standard Bedrock tools, but NOT for Anthropic provider-defined tools
  let bedrockToolChoice: BedrockToolConfiguration['toolChoice'] = undefined;
  if (
    !usingAnthropicTools &&
    additionalTools?.tool_choice == null &&
    bedrockTools.length > 0 &&
    preparedToolChoice
  ) {
    const type = preparedToolChoice.type;
    switch (type) {
      case 'auto':
        bedrockToolChoice = { auto: {} };
        break;
      case 'required':
        bedrockToolChoice = { any: {} };
        break;
      case 'none':
        bedrockTools.length = 0;
        bedrockToolChoice = undefined;
        break;
      case 'tool':
        bedrockToolChoice = {
          tool: { name: preparedToolChoice.toolName },
        };
        break;
      default: {
        const _exhaustiveCheck: never = type;
        throw new UnsupportedFunctionalityError({
          functionality: `tool choice type: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  const toolConfig: BedrockToolConfiguration =
    bedrockTools.length > 0
      ? { tools: bedrockTools, toolChoice: bedrockToolChoice }
      : {};

  return {
    toolConfig,
    additionalTools,
    betas,
    toolWarnings,
  };
}
