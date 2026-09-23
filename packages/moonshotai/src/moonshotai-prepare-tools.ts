import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import type { MoonshotAIFunctionTool } from './moonshotai-chat-api-types';
import type { MoonshotAIChatModelId } from './moonshotai-chat-options';
import { normalizeJsonSchemaForMFJS } from './normalize-json-schema-for-mfjs';

export function prepareTools({
  tools,
  toolChoice,
  modelId,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
  modelId: MoonshotAIChatModelId;
}): {
  tools: undefined | Array<MoonshotAIFunctionTool>;
  toolChoice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'required'
    | undefined;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const moonshotTools: Array<MoonshotAIFunctionTool> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      moonshotTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: normalizeJsonSchemaForMFJS(tool.inputSchema),
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: moonshotTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: moonshotTools, toolChoice: type, toolWarnings };
    case 'required':
      if (
        modelId === 'kimi-k2.6' ||
        modelId === 'kimi-k2.7-code' ||
        modelId === 'kimi-k2.7-code-highspeed'
      ) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `tool choice "required" for model "${modelId}"`,
          details:
            'Moonshot AI rejects required tool choice for this model. The setting has been omitted; use "auto" or select a specific tool instead.',
        });
        return {
          tools: moonshotTools,
          toolChoice: undefined,
          toolWarnings,
        };
      }
      return { tools: moonshotTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: moonshotTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
