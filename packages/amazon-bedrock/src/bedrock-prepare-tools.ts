// packages/amazon-bedrock/src/bedrock-prepare-tools.ts

import {
  JSONObject,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { webSearch_20250305ArgsSchema } from './tool/web-search_20250305';
import { BedrockTool, BedrockToolConfiguration } from './bedrock-api-types';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV2CallOptions['tools'];
  toolChoice?: LanguageModelV2CallOptions['toolChoice'];
}): {
  toolConfig: BedrockToolConfiguration;
  anthropicTools: any[] | undefined;
  toolWarnings: LanguageModelV2CallWarning[];
  betas: Set<string>;
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV2CallWarning[] = [];
  const standardTools: BedrockTool[] = [];
  const anthropicTools: any[] = [];
  const betas = new Set<string>();

  if (tools == null) {
    return {
      toolConfig: { tools: undefined, toolChoice: undefined },
      anthropicTools: undefined,
      toolWarnings,
      betas,
    };
  }

  for (const tool of tools) {
    switch (tool.type) {
      case 'function':
        standardTools.push({
          toolSpec: {
            name: tool.name,
            description: tool.description,
            inputSchema: {
              json: tool.inputSchema as JSONObject,
            },
          },
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
          // FIX: Added missing case for the mismatched bash tool ID
          case 'anthropic.bash_20250124':
          case 'anthropic.bashTool_20250124':
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

  // ... (the rest of the function for toolChoice remains the same)
  let toolChoiceConfig: BedrockToolConfiguration['toolChoice'] | undefined =
    undefined;

  if (toolChoice?.type === 'none') {
    return {
      toolConfig: { tools: undefined, toolChoice: undefined },
      anthropicTools: undefined,
      toolWarnings,
      betas,
    };
  }

  if (toolChoice != null) {
    const type = toolChoice.type;

    switch (type) {
      case 'auto':
        toolChoiceConfig = { auto: {} };
        break;
      case 'required':
        toolChoiceConfig = { any: {} };
        break;
      case 'tool':
        toolChoiceConfig = { tool: { name: toolChoice.toolName } };
        break;
      default: {
        const _exhaustiveCheck: never = type;
        throw new UnsupportedFunctionalityError({
          functionality: `tool choice type: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return {
    toolConfig: {
      tools: standardTools.length > 0 ? standardTools : undefined,
      toolChoice: toolChoiceConfig,
    },
    anthropicTools: anthropicTools.length > 0 ? anthropicTools : undefined,
    toolWarnings,
    betas,
  };
}
