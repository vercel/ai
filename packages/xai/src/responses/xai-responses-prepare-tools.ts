import {
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { validateTypes } from '@ai-sdk/provider-utils';
import { webSearchArgsSchema } from '../tool/web-search';
import { xSearchArgsSchema } from '../tool/x-search';
import { XaiResponsesTool } from './xai-responses-api';

type XaiResponsesToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'web_search' }
  | { type: 'x_search' }
  | { type: 'code_interpreter' }
  | { type: 'file_search' }
  | { type: 'mcp' }
  | { type: 'function'; name: string };

export async function prepareResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
}): Promise<{
  tools: Array<XaiResponsesTool> | undefined;
  toolChoice: XaiResponsesToolChoice | undefined;
  toolWarnings: LanguageModelV3CallWarning[];
}> {
  const normalizedTools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV3CallWarning[] = [];

  if (normalizedTools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const xaiTools: Array<XaiResponsesTool> = [];
  const toolByName = new Map<string, (typeof normalizedTools)[number]>();

  for (const tool of normalizedTools) {
    toolByName.set(tool.name, tool);

    if (tool.type === 'provider-defined') {
      switch (tool.id) {
        case 'xai.web_search': {
          const args = await validateTypes({
            value: tool.args,
            schema: webSearchArgsSchema,
          });

          xaiTools.push({
            type: 'web_search',
            allowed_domains: args.allowedDomains,
            excluded_domains: args.excludedDomains,
            enable_image_understanding: args.enableImageUnderstanding,
          });
          break;
        }

        case 'xai.x_search': {
          const args = await validateTypes({
            value: tool.args,
            schema: xSearchArgsSchema,
          });

          xaiTools.push({
            type: 'x_search',
            allowed_x_handles: args.allowedXHandles,
            excluded_x_handles: args.excludedXHandles,
            from_date: args.fromDate,
            to_date: args.toDate,
            enable_image_understanding: args.enableImageUnderstanding,
            enable_video_understanding: args.enableVideoUnderstanding,
          });
          break;
        }

        case 'xai.code_execution': {
          xaiTools.push({
            type: 'code_interpreter',
          });
          break;
        }

        case 'xai.file_search': {
          xaiTools.push({
            type: 'file_search',
          });
          break;
        }

        case 'xai.mcp': {
          xaiTools.push({
            type: 'mcp',
          });
          break;
        }

        default: {
          toolWarnings.push({ type: 'unsupported-tool', tool });
          break;
        }
      }
    } else {
      xaiTools.push({
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
    return { tools: xaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: xaiTools, toolChoice: type, toolWarnings };
    case 'required':
      return { tools: xaiTools, toolChoice: 'required', toolWarnings };
    case 'tool': {
      const selectedTool = toolByName.get(toolChoice.toolName);

      if (selectedTool == null) {
        return {
          tools: xaiTools,
          toolChoice: undefined,
          toolWarnings,
        };
      }

      if (selectedTool.type === 'provider-defined') {
        switch (selectedTool.id) {
          case 'xai.web_search':
            return {
              tools: xaiTools,
              toolChoice: { type: 'web_search' },
              toolWarnings,
            };
          case 'xai.x_search':
            return {
              tools: xaiTools,
              toolChoice: { type: 'x_search' },
              toolWarnings,
            };
          case 'xai.code_execution':
            return {
              tools: xaiTools,
              toolChoice: { type: 'code_interpreter' },
              toolWarnings,
            };
          case 'xai.file_search':
            return {
              tools: xaiTools,
              toolChoice: { type: 'file_search' },
              toolWarnings,
            };
          case 'xai.mcp':
            return {
              tools: xaiTools,
              toolChoice: { type: 'mcp' },
              toolWarnings,
            };
          default:
            toolWarnings.push({ type: 'unsupported-tool', tool: selectedTool });
            return { tools: xaiTools, toolChoice: undefined, toolWarnings };
        }
      }

      return {
        tools: xaiTools,
        toolChoice: { type: 'function', name: selectedTool.name },
        toolWarnings,
      };
    }
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}
