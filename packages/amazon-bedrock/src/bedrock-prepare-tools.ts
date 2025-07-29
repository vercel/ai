import {
  JSONObject,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  prepareTools as prepareAnthropicTools,
} from '@ai-sdk/anthropic/internal';
import { BedrockTool, BedrockToolConfiguration } from './bedrock-api-types';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  modelId: string;
}): {
  toolConfig: BedrockToolConfiguration;
  additionalTools: Record<string, unknown> | undefined;
  betas: Set<string>;
  toolWarnings: LanguageModelV2CallWarning[];
} {
  const toolWarnings: LanguageModelV2CallWarning[] = [];
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
      tool.type === 'provider-defined' &&
      tool.id === 'anthropic.web_search_20250305'
    ) {
      toolWarnings.push({
        type: 'unsupported-tool',
        tool,
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
  const providerDefinedTools = supportedTools.filter(
    t => t.type === 'provider-defined',
  );
  const functionTools = supportedTools.filter(t => t.type === 'function');

  let additionalTools: Record<string, unknown> | undefined = undefined;
  const bedrockTools: BedrockTool[] = [];

  const usingAnthropicTools =
    isAnthropicModel && providerDefinedTools.length > 0;

  // Handle Anthropic provider-defined tools for Anthropic models on Bedrock
  if (usingAnthropicTools) {
    if (functionTools.length > 0) {
      toolWarnings.push({
        type: 'unsupported-setting',
        setting: 'tools',
        details:
          'Mixed Anthropic provider-defined tools and standard function tools are not supported in a single call to Bedrock. Only Anthropic tools will be used.',
      });
    }

    const {
      toolChoice: preparedAnthropicToolChoice,
      toolWarnings: anthropicToolWarnings,
      betas: anthropicBetas,
    } = prepareAnthropicTools({
      tools: providerDefinedTools,
      toolChoice,
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
    for (const tool of providerDefinedTools) {
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
              json: asSchema(fullToolDefinition.inputSchema)
                .jsonSchema as JSONObject,
            },
          },
        });
      } else {
        toolWarnings.push({ type: 'unsupported-tool', tool });
      }
    }
  } else {
    // Report unsupported provider-defined tools for non-anthropic models
    for (const tool of providerDefinedTools) {
      toolWarnings.push({ type: 'unsupported-tool', tool });
    }
  }

  // Handle standard function tools for all models
  for (const tool of functionTools) {
    bedrockTools.push({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: tool.inputSchema as JSONObject,
        },
      },
    });
  }

  // Handle toolChoice for standard Bedrock tools, but NOT for Anthropic provider-defined tools
  let bedrockToolChoice: BedrockToolConfiguration['toolChoice'] = undefined;
  if (!usingAnthropicTools && bedrockTools.length > 0 && toolChoice) {
    const type = toolChoice.type;
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
        bedrockToolChoice = { tool: { name: toolChoice.toolName } };
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
