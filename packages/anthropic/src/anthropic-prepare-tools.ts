import { LanguageModelV1 } from '@ai-sdk/provider';
import { AnthropicTool, AnthropicToolChoice } from './anthropic-tools';

export function prepareTools(
  mode: Parameters<LanguageModelV1['doGenerate']>[0]['mode'] & {
    type: 'regular';
  },
): {
  tools: Array<AnthropicTool> | undefined;
  tool_choice: AnthropicToolChoice | undefined;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined };
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

            // TODO warning for unsupported tool id
            default:
              return null;
          }
        }

        // TODO warning for unsupported tool type
        default: {
          return null;
        }
      }
    })
    .filter((item): item is AnthropicTool => item != null);

  const toolChoice = mode.toolChoice;

  if (toolChoice == null) {
    return { tools: anthropicTools, tool_choice: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return { tools: anthropicTools, tool_choice: { type: 'auto' } };
    case 'required':
      return { tools: anthropicTools, tool_choice: { type: 'any' } };
    case 'none':
      // Anthropic does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, tool_choice: undefined };
    case 'tool':
      return {
        tools: anthropicTools,
        tool_choice: { type: 'tool', name: toolChoice.toolName },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}
