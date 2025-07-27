import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { AnthropicTool, AnthropicToolChoice } from './anthropic-api-types';
import { getCacheControl } from './get-cache-control';
import { webSearch_20250305ArgsSchema } from './tool/web-search_20250305';

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
  disableParallelToolUse,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
  disableParallelToolUse?: boolean;
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
        const cacheControl = getCacheControl(tool.providerOptions);

        anthropicTools.push({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
          cache_control: cacheControl,
        });
        break;
      case 'provider-defined':
        switch (tool.id) {
          case 'anthropic.computer_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: 'computer',
              type: 'computer_20250124',
              display_width_px: tool.args.displayWidthPx as number,
              display_height_px: tool.args.displayHeightPx as number,
              display_number: tool.args.displayNumber as number,
            });
            break;
          case 'anthropic.computer_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: 'computer',
              type: 'computer_20241022',
              display_width_px: tool.args.displayWidthPx as number,
              display_height_px: tool.args.displayHeightPx as number,
              display_number: tool.args.displayNumber as number,
            });
            break;
          case 'anthropic.text_editor_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: 'str_replace_editor',
              type: 'text_editor_20250124',
            });
            break;
          case 'anthropic.text_editor_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: 'str_replace_editor',
              type: 'text_editor_20241022',
            });
            break;
          case 'anthropic.text_editor_20250429':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: 'str_replace_based_edit_tool',
              type: 'text_editor_20250429',
            });
            break;
          case 'anthropic.bash_20250124':
            betas.add('computer-use-2025-01-24');
            anthropicTools.push({
              name: 'bash',
              type: 'bash_20250124',
            });
            break;
          case 'anthropic.bash_20241022':
            betas.add('computer-use-2024-10-22');
            anthropicTools.push({
              name: 'bash',
              type: 'bash_20241022',
            });
            break;
          case 'anthropic.web_search_20250305': {
            const args = webSearch_20250305ArgsSchema.parse(tool.args);
            anthropicTools.push({
              type: 'web_search_20250305',
              name: 'web_search',
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              user_location: args.userLocation,
            });
            break;
          }
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
      toolChoice: disableParallelToolUse
        ? { type: 'auto', disable_parallel_tool_use: disableParallelToolUse }
        : undefined,
      toolWarnings,
      betas,
    };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
      return {
        tools: anthropicTools,
        toolChoice: {
          type: 'auto',
          disable_parallel_tool_use: disableParallelToolUse,
        },
        toolWarnings,
        betas,
      };
    case 'required':
      return {
        tools: anthropicTools,
        toolChoice: {
          type: 'any',
          disable_parallel_tool_use: disableParallelToolUse,
        },
        toolWarnings,
        betas,
      };
    case 'none':
      // Anthropic does not support 'none' tool choice, so we remove the tools:
      return { tools: undefined, toolChoice: undefined, toolWarnings, betas };
    case 'tool':
      return {
        tools: anthropicTools,
        toolChoice: {
          type: 'tool',
          name: toolChoice.toolName,
          disable_parallel_tool_use: disableParallelToolUse,
        },
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
