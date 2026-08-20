import {
  UnsupportedFunctionalityError,
  type LanguageModelV4CallOptions,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import { validateTypes } from '@ai-sdk/provider-utils';
import { removeAdditionalPropertiesFalse } from '../remove-additional-properties';
import { fileSearchArgsSchema } from '../tool/file-search';
import { imageGenerationArgsSchema } from '../tool/image-generation';
import { mcpServerArgsSchema } from '../tool/mcp-server';
import { webSearchArgsSchema } from '../tool/web-search';
import { xSearchArgsSchema } from '../tool/x-search';
import type { SpaceXAIResponsesTool } from './spacexai-responses-api';

type SpaceXAIResponsesToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string };

export async function prepareResponsesTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): Promise<{
  tools: Array<SpaceXAIResponsesTool> | undefined;
  toolChoice: SpaceXAIResponsesToolChoice | undefined;
  toolWarnings: SharedV4Warning[];
}> {
  const normalizedTools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (normalizedTools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const spacexaiTools: Array<SpaceXAIResponsesTool> = [];
  const toolByName = new Map<string, (typeof normalizedTools)[number]>();

  for (const tool of normalizedTools) {
    toolByName.set(tool.name, tool);

    if (tool.type === 'provider') {
      switch (tool.id) {
        case 'spacexai.web_search':
        case 'xai.web_search': {
          const args = await validateTypes({
            value: tool.args,
            schema: webSearchArgsSchema,
          });

          spacexaiTools.push({
            type: 'web_search',
            allowed_domains: args.allowedDomains,
            excluded_domains: args.excludedDomains,
            enable_image_search: args.enableImageSearch,
            enable_image_understanding: args.enableImageUnderstanding,
          });
          break;
        }

        case 'spacexai.x_search':
        case 'xai.x_search': {
          const args = await validateTypes({
            value: tool.args,
            schema: xSearchArgsSchema,
          });

          spacexaiTools.push({
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

        case 'spacexai.code_execution':
        case 'xai.code_execution': {
          spacexaiTools.push({
            type: 'code_interpreter',
          });
          break;
        }

        case 'spacexai.view_image':
        case 'xai.view_image': {
          spacexaiTools.push({
            type: 'view_image',
          });
          break;
        }

        case 'spacexai.view_x_video':
        case 'xai.view_x_video': {
          spacexaiTools.push({
            type: 'view_x_video',
          });
          break;
        }

        case 'spacexai.image_generation':
        case 'xai.image_generation': {
          const args = await validateTypes({
            value: tool.args,
            schema: imageGenerationArgsSchema,
          });

          spacexaiTools.push({
            type: 'image_generation',
            action: args.action,
          });
          break;
        }

        case 'spacexai.file_search':
        case 'xai.file_search': {
          const args = await validateTypes({
            value: tool.args,
            schema: fileSearchArgsSchema,
          });

          spacexaiTools.push({
            type: 'file_search',
            vector_store_ids: args.vectorStoreIds,
            max_num_results: args.maxNumResults,
          });
          break;
        }

        case 'spacexai.mcp':
        case 'xai.mcp': {
          const args = await validateTypes({
            value: tool.args,
            schema: mcpServerArgsSchema,
          });

          spacexaiTools.push({
            type: 'mcp',
            server_url: args.serverUrl,
            server_label: args.serverLabel,
            server_description: args.serverDescription,
            allowed_tools: args.allowedTools,
            headers: args.headers,
            authorization: args.authorization,
          });
          break;
        }

        default: {
          toolWarnings.push({
            type: 'unsupported',
            feature: `provider-defined tool ${tool.name}`,
          });
          break;
        }
      }
    } else {
      spacexaiTools.push({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: removeAdditionalPropertiesFalse(tool.inputSchema),
        ...(tool.strict != null ? { strict: tool.strict } : {}),
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
      return { tools: spacexaiTools, toolChoice: 'required', toolWarnings };
    case 'tool': {
      const selectedTool = toolByName.get(toolChoice.toolName);

      if (selectedTool == null) {
        return {
          tools: spacexaiTools,
          toolChoice: undefined,
          toolWarnings,
        };
      }

      if (selectedTool.type === 'provider') {
        // xAI API does not support forcing specific server-side tools via toolChoice
        // Only function tools can be forced with {"type": "function", "function": {"name": "..."}}
        toolWarnings.push({
          type: 'unsupported',
          feature: `toolChoice for server-side tool "${selectedTool.name}"`,
        });
        return { tools: spacexaiTools, toolChoice: undefined, toolWarnings };
      }

      return {
        tools: spacexaiTools,
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
