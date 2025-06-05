import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { AnthropicTool, AnthropicToolChoice } from './anthropic-api-types';

function isWebSearchTool(
  tool: unknown,
): tool is Extract<AnthropicTool, { type: 'web_search_20250305' }> {
  return (
    typeof tool === 'object' &&
    tool !== null &&
    'type' in tool &&
    tool.type === 'web_search_20250305'
  );
}

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
}): {
  tools: Array<AnthropicTool> | undefined;
  toolChoice: AnthropicToolChoice | undefined;
  toolWarnings: LanguageModelV2CallWarning[];
  betas: Set<string>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];
  const betas = new Set<string>();

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings, betas };
  }

  const anthropicTools: AnthropicTool[] = [];

  for (const tool of tools) {
    // handle direct web search tool objects passed from provider options
    if (isWebSearchTool(tool)) {
      anthropicTools.push(tool);
      continue;
    }

    switch (tool.type) {
      case 'function':
        anthropicTools.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        });
        break;
      case 'provider-defined':
        switch (tool.id) {
          case 'anthropic.computer_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: tool.name,
              type: 'computer_20250124',
              display_width_px: tool.args.displayWidthPx as number,
              display_height_px: tool.args.displayHeightPx as number,
              display_number: tool.args.displayNumber as number,
            });
            break;
          case 'anthropic.computer_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: tool.name,
              type: 'computer_20241022',
              display_width_px: tool.args.displayWidthPx as number,
              display_height_px: tool.args.displayHeightPx as number,
              display_number: tool.args.displayNumber as number,
            });
            break;
          case 'anthropic.text_editor_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: tool.name,
              type: 'text_editor_20250124',
            });
            break;
          case 'anthropic.text_editor_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: tool.name,
              type: 'text_editor_20241022',
            });
            break;
          case 'anthropic.bash_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: tool.name,
              type: 'bash_20250124',
            });
            break;
          case 'anthropic.bash_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: tool.name,
              type: 'bash_20241022',
            });
            break;
          default:
            toolWarnings.push({ type: 'unsupported-tool', tool });
            break;
        }
        break;
      default:
        toolWarnings.push({ type: 'unsupported-tool', tool });
        break;
    }
  }

  if (toolChoice == null) {
    return {
      tools: anthropicTools,
      toolChoice: undefined,
      toolWarnings,
      betas,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: anthropicTools,
        toolChoice: { type: 'auto' },
        toolWarnings,
        betas,
      };
    case 'required':
      return {
        tools: anthropicTools,
        toolChoice: { type: 'any' },
        toolWarnings,
        betas,
      };
    case 'none':
      // Anthropic does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, toolChoice: undefined, toolWarnings, betas };
    case 'tool':
      return {
        tools: anthropicTools,
        toolChoice: { type: 'tool', name: toolChoice.toolName },
        toolWarnings,
        betas,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
