import { LanguageModelV1, LanguageModelV1CallWarning } from '@ai-sdk/provider';
import { AnthropicTool, AnthropicToolChoice } from './anthropic-api-types';

export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): {
  tools: Array<AnthropicTool> | undefined;
  tool_choice: AnthropicToolChoice | undefined;
  toolWarnings: LanguageModelV1CallWarning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  const toolWarnings: LanguageModelV1CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined, toolWarnings };
  }

  const anthropicTools: AnthropicTool[] = [];

  for (const tool of tools) {
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
          case 'anthropic.computer_20241022':
            anthropicTools.push({
              name: tool.name,
              type: 'computer_20241022',
              display_width_px: tool.args.displayWidthPx as number,
              display_height_px: tool.args.displayHeightPx as number,
              display_number: tool.args.displayNumber as number,
            });
            break;
          case 'anthropic.text_editor_20241022':
            anthropicTools.push({
              name: tool.name,
              type: 'text_editor_20241022',
            });
            break;
          case 'anthropic.bash_20241022':
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

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: anthropicTools, tool_choice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: anthropicTools,
        tool_choice: { type: 'auto' },
        toolWarnings,
      };
    case 'required':
      return {
        tools: anthropicTools,
        tool_choice: { type: 'any' },
        toolWarnings,
      };
    case 'none':
      // Anthropic does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, tool_choice: undefined, toolWarnings };
    case 'tool':
      return {
        tools: anthropicTools,
        tool_choice: { type: 'tool', name: toolChoice.toolName },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
