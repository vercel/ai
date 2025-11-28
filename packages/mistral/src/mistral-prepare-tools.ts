import {
  LanguageModelV3CallOptions,
  SharedV3Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { MistralToolChoice } from './mistral-chat-prompt';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
}): {
  tools:
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
        };
      }>
    | undefined;
  toolChoice: MistralToolChoice | undefined;
  toolWarnings: SharedV3Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV3Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const mistralTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider-defined') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      // Warn about unsupported advanced tool use features (Anthropic-only)
      if (tool.deferLoading) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `deferLoading on tool '${tool.name}'`,
          details: 'deferLoading is only supported by Anthropic Claude models',
        });
      }
      if (tool.allowedCallers && tool.allowedCallers.length > 0) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `allowedCallers on tool '${tool.name}'`,
          details:
            'allowedCallers is only supported by Anthropic Claude models',
        });
      }
      if (tool.inputExamples && tool.inputExamples.length > 0) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `inputExamples on tool '${tool.name}'`,
          details:
            'inputExamples is only supported by Anthropic Claude models',
        });
      }

      mistralTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: mistralTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: mistralTools, toolChoice: type, toolWarnings };
    case 'required':
      return { tools: mistralTools, toolChoice: 'any', toolWarnings };

    // mistral does not support tool mode directly,
    // so we filter the tools and force the tool choice through 'any'
    case 'tool':
      return {
        tools: mistralTools.filter(
          tool => tool.function.name === toolChoice.toolName,
        ),
        toolChoice: 'any',
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
