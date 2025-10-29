import {
  LanguageModelV3CallOptions,
  LanguageModelV3CallWarning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { validateTypes } from '@ai-sdk/provider-utils';
import { webSearchArgsSchema } from '../tool/web-search';
import { xSearchArgsSchema } from '../tool/x-search';
import { XaiResponsesTool } from './xai-responses-api';

export async function prepareResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV3CallOptions['tools'];
  toolChoice?: LanguageModelV3CallOptions['toolChoice'];
}): Promise<{
  tools: Array<XaiResponsesTool> | undefined;
  toolChoice: string | undefined;
  toolWarnings: LanguageModelV3CallWarning[];
}> {
  tools = tools?.length ? tools : undefined;

  const toolWarnings: LanguageModelV3CallWarning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const xaiTools: Array<XaiResponsesTool> = [];

  for (const tool of tools) {
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
    case 'tool':
      return {
        tools: xaiTools,
        toolChoice: toolChoice.toolName,
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
