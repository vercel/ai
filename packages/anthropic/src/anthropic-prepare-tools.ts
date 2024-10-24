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

  const anthropicTools = tools
    .map(tool => {
      switch (tool.type) {
        case 'function':
          return {
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
          };
        case 'provider-defined': {
          switch (tool.id) {
            case 'anthropic.computer_20241022':
              return {
                name: tool.name,
                type: 'computer_20241022',
                display_width_px: tool.args.displayWidthPx,
                display_height_px: tool.args.displayHeightPx,
                display_number: tool.args.displayNumber,
              };
            case 'anthropic.text_editor_20241022':
              return {
                name: tool.name,
                type: 'text_editor_20241022',
              };
            case 'anthropic.bash_20241022':
              return {
                name: tool.name,
                type: 'bash_20241022',
              };
            default:
              toolWarnings.push({ type: 'unsupported-tool', tool });
              return null;
          }
        }
        default: {
          toolWarnings.push({ type: 'unsupported-tool', tool });
          return null;
        }
      }
    })
    .filter((item): item is AnthropicTool => item != null);

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
