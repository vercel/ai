import {
  UnsupportedFunctionalityError,
  type JSONObject,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  prepareTools as prepareAnthropicTools,
} from '@ai-sdk/anthropic/internal';
import { supportsStrictTools } from './amazon-bedrock-anthropic-model-support';
import type {
  AmazonBedrockTool,
  AmazonBedrockToolConfiguration,
} from './amazon-bedrock-api-types';

export async function prepareTools({
  tools,
  toolChoice,
  modelId,
  disableParallelToolUse,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  modelId: string;
  disableParallelToolUse?: boolean;
}): Promise<{
  toolConfig: AmazonBedrockToolConfiguration;
  additionalTools: Record<string, unknown> | undefined;
  betas: Set<string>;
  toolWarnings: SharedV4Warning[];
}> {
  const toolWarnings: SharedV4Warning[] = [];
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

  const isAnthropicModel = modelId.includes('anthropic.');
  const ProviderTools = supportedTools.filter(t => t.type === 'provider');
  const functionTools = supportedTools.filter(t => t.type === 'function');

  let additionalTools: Record<string, unknown> | undefined = undefined;
  const amazonBedrockTools: AmazonBedrockTool[] = [];

  const usingAnthropicTools = isAnthropicModel && ProviderTools.length > 0;

  // Handle Anthropic provider-defined tools for Anthropic models on Bedrock
  if (usingAnthropicTools) {
    const {
      toolChoice: preparedAnthropicToolChoice,
      toolWarnings: anthropicToolWarnings,
      betas: anthropicBetas,
    } = await prepareAnthropicTools({
      tools: ProviderTools,
      toolChoice,
      disableParallelToolUse,
      supportsStructuredOutput: false,
      supportsStrictTools: false,
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
    for (const tool of ProviderTools) {
      const toolFactory = Object.values(anthropicTools).find(factory => {
        const instance = (factory as (args: any) => any)({});
        return instance.id === tool.id;
      });

      if (toolFactory != null) {
        const fullToolDefinition = (toolFactory as (args: any) => any)({});
        amazonBedrockTools.push({
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
    for (const tool of ProviderTools) {
      toolWarnings.push({ type: 'unsupported', feature: `tool ${tool.id}` });
    }
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

    amazonBedrockTools.push({
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
    amazonBedrockTools.length > 0 &&
    toolChoice?.type !== 'none'
  ) {
    additionalTools = {
      tool_choice:
        toolChoice?.type === 'required'
          ? { type: 'any', disable_parallel_tool_use: true }
          : toolChoice?.type === 'tool'
            ? {
                type: 'tool',
                name: toolChoice.toolName,
                disable_parallel_tool_use: true,
              }
            : { type: 'auto', disable_parallel_tool_use: true },
    };
  }

  // Handle toolChoice for standard Bedrock tools, but NOT for Anthropic provider-defined tools
  let amazonBedrockToolChoice: AmazonBedrockToolConfiguration['toolChoice'] =
    undefined;
  if (
    !usingAnthropicTools &&
    additionalTools?.tool_choice == null &&
    amazonBedrockTools.length > 0 &&
    toolChoice
  ) {
    const type = toolChoice.type;
    switch (type) {
      case 'auto':
        amazonBedrockToolChoice = { auto: {} };
        break;
      case 'required':
        amazonBedrockToolChoice = { any: {} };
        break;
      case 'none':
        amazonBedrockTools.length = 0;
        amazonBedrockToolChoice = undefined;
        break;
      case 'tool':
        amazonBedrockToolChoice = { tool: { name: toolChoice.toolName } };
        break;
      default: {
        const _exhaustiveCheck: never = type;
        throw new UnsupportedFunctionalityError({
          functionality: `tool choice type: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  const toolConfig: AmazonBedrockToolConfiguration =
    amazonBedrockTools.length > 0
      ? { tools: amazonBedrockTools, toolChoice: amazonBedrockToolChoice }
      : {};

  return {
    toolConfig,
    additionalTools,
    betas,
    toolWarnings,
  };
}
