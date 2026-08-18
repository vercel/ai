import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { removeAdditionalPropertiesFalse } from './remove-additional-properties';
import type { SpaceXAIToolChoice } from './spacexai-chat-prompt';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools:
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
          strict?: boolean;
        };
      }>
    | undefined;
  toolChoice: SpaceXAIToolChoice | undefined;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  // convert AI SDK tools to SpaceXAI format
  const spacexaiTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
      strict?: boolean;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.name}`,
      });
    } else {
      spacexaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: removeAdditionalPropertiesFalse(tool.inputSchema),
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: spacexaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: spacexaiTools, toolChoice: type, toolWarnings };
    case 'required':
      // xai supports 'required' directly
      return { tools: spacexaiTools, toolChoice: 'required', toolWarnings };
    case 'tool':
      // xai supports specific tool selection
      return {
        tools: spacexaiTools,
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
