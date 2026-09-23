import {
  UnsupportedFunctionalityError,
  type JSONObject,
  type JSONSchema7Definition,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { asSchema } from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  prepareTools as prepareAnthropicTools,
} from '@ai-sdk/anthropic/internal';
import {
  isAnthropicModel as detectAnthropicModel,
  supportsStrictTools,
} from './amazon-bedrock-anthropic-model-support';
import type {
  AmazonBedrockTool,
  AmazonBedrockToolConfiguration,
} from './amazon-bedrock-api-types';
import type { AmazonBedrockChatModelSettings } from './amazon-bedrock-chat-language-model-options';

export async function prepareTools({
  tools,
  toolChoice,
  modelId,
  modelFamily,
  reasoningBudgetTokens,
  disableParallelToolUse,
  rejectsForcedToolUse = false,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  modelId: string;
  modelFamily?: AmazonBedrockChatModelSettings['modelFamily'];
  reasoningBudgetTokens?: number;
  disableParallelToolUse?: boolean;
  rejectsForcedToolUse?: boolean;
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

  // Filter out Anthropic web tools that Amazon Bedrock does not support.
  const supportedTools = tools.filter(tool => {
    if (
      tool.type === 'provider' &&
      (tool.id === 'anthropic.web_search_20250305' ||
        tool.id === 'anthropic.web_search_20260318' ||
        tool.id === 'anthropic.web_fetch_20260318')
    ) {
      toolWarnings.push({
        type: 'unsupported',
        feature: `${tool.id.slice('anthropic.'.length)} tool`,
        details: `The ${tool.id.slice('anthropic.'.length)} tool is not supported on Amazon Bedrock.`,
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
  const amazonBedrockTools: AmazonBedrockTool[] = [];

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
    const supportsStrictForTool =
      supportsStrictOnTools &&
      (tool.strict !== true || isStrictToolSchemaCompatible(tool.inputSchema));

    if (!supportsStrictOnTools && tool.strict != null) {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'strict',
        details: `Tool '${tool.name}' has strict: ${tool.strict}, but strict mode is not supported by this model on Amazon Bedrock. The strict property will be ignored.`,
      });
    } else if (tool.strict === true && !supportsStrictForTool) {
      toolWarnings.push({
        type: 'unsupported',
        feature: 'strict',
        details: `Tool '${tool.name}' has strict: true, but Amazon Bedrock requires every object in a strict tool schema to set additionalProperties: false. The strict property will be ignored.`,
      });
    }

    amazonBedrockTools.push({
      toolSpec: {
        name: tool.name,
        ...(tool.description?.trim() !== ''
          ? { description: tool.description }
          : {}),
        ...(tool.strict != null && supportsStrictForTool
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
  let amazonBedrockToolChoice: AmazonBedrockToolConfiguration['toolChoice'] =
    undefined;
  if (
    !usingAnthropicTools &&
    additionalTools?.tool_choice == null &&
    amazonBedrockTools.length > 0 &&
    preparedToolChoice
  ) {
    const type = preparedToolChoice.type;
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
        amazonBedrockToolChoice = {
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

function isStrictToolSchemaCompatible(schema: JSONSchema7Definition): boolean {
  if (typeof schema === 'boolean') {
    return true;
  }

  const schemaWithDefs = schema as typeof schema & {
    $defs?: Record<string, JSONSchema7Definition>;
  };

  if (
    (schema.type === 'object' ||
      (Array.isArray(schema.type) && schema.type.includes('object'))) &&
    schema.additionalProperties !== false
  ) {
    return false;
  }

  const schemaMaps = [
    schema.properties,
    schema.patternProperties,
    schema.definitions,
    schemaWithDefs.$defs,
  ];

  for (const schemaMap of schemaMaps) {
    if (
      schemaMap != null &&
      Object.values(schemaMap).some(
        definition => !isStrictToolSchemaCompatible(definition),
      )
    ) {
      return false;
    }
  }

  if (
    schema.dependencies != null &&
    Object.values(schema.dependencies).some(
      dependency =>
        !Array.isArray(dependency) && !isStrictToolSchemaCompatible(dependency),
    )
  ) {
    return false;
  }

  const nestedSchemas = [
    schema.propertyNames,
    schema.contains,
    schema.not,
    schema.if,
    schema.then,
    schema.else,
  ];

  if (
    nestedSchemas.some(
      nestedSchema =>
        nestedSchema != null && !isStrictToolSchemaCompatible(nestedSchema),
    )
  ) {
    return false;
  }

  if (
    schema.items != null &&
    (Array.isArray(schema.items)
      ? schema.items.some(item => !isStrictToolSchemaCompatible(item))
      : !isStrictToolSchemaCompatible(schema.items))
  ) {
    return false;
  }

  return [schema.anyOf, schema.allOf, schema.oneOf].every(
    alternatives =>
      alternatives == null || alternatives.every(isStrictToolSchemaCompatible),
  );
}
