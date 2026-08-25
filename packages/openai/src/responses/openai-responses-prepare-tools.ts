import {
  UnsupportedFunctionalityError,
  type JSONSchema7,
  type JSONObject,
  type LanguageModelV4CallOptions,
  type LanguageModelV4FunctionTool,
  type SharedV4ProviderReference,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  resolveProviderReference,
  validateTypes,
  type ToolNameMapping,
} from '@ai-sdk/provider-utils';
import { codeInterpreterArgsSchema } from '../tool/code-interpreter';
import { fileSearchArgsSchema } from '../tool/file-search';
import { imageGenerationArgsSchema } from '../tool/image-generation';
import { customArgsSchema } from '../tool/custom';
import { mcpArgsSchema } from '../tool/mcp';
import { shellArgsSchema } from '../tool/shell';
import { toolSearchArgsSchema } from '../tool/tool-search';
import { webSearchArgsSchema } from '../tool/web-search';
import { webSearchPreviewArgsSchema } from '../tool/web-search-preview';
import type {
  OpenAIResponsesAllowedTool,
  OpenAIResponsesFunctionTool,
  OpenAIResponsesTool,
} from './openai-responses-api';

type AllowedToolResolution =
  | { supported: true; entry: OpenAIResponsesAllowedTool }
  | { supported: false; reason: string };

export type OpenAIToolOptions = {
  allowedCallers?: Array<'direct' | 'programmatic'>;
  deferLoading?: boolean;
  outputSchema?: JSONObject;
  namespace?: {
    name: string;
    description: string;
  };
};

export async function prepareResponsesTools({
  tools,
  toolChoice,
  allowedTools,
  toolNameMapping,
  customProviderToolNames,
  outputSchemaToolNames,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice: LanguageModelV4CallOptions['toolChoice'] | undefined;
  allowedTools?: {
    toolNames: string[];
    mode?: 'auto' | 'required';
  };
  toolNameMapping?: ToolNameMapping;
  customProviderToolNames?: Set<string>;
  outputSchemaToolNames?: Set<string>;
}): Promise<{
  tools?: Array<OpenAIResponsesTool>;
  toolChoice?:
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'file_search' }
    | { type: 'web_search_preview' }
    | { type: 'web_search' }
    | { type: 'function'; name: string }
    | { type: 'custom'; name: string }
    | { type: 'code_interpreter' }
    | { type: 'mcp' }
    | { type: 'image_generation' }
    | { type: 'apply_patch' }
    | { type: 'computer' }
    | { type: 'programmatic_tool_calling' }
    | {
        type: 'allowed_tools';
        mode: 'auto' | 'required';
        tools: Array<OpenAIResponsesAllowedTool>;
      };
  toolWarnings: SharedV4Warning[];
}> {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiTools: Array<OpenAIResponsesTool> = [];
  const namespaceTools = new Map<
    string,
    Extract<OpenAIResponsesTool, { type: 'namespace' }>
  >();
  const resolvedCustomProviderToolNames =
    customProviderToolNames ?? new Set<string>();

  const allowedToolResolutions = new Map<string, AllowedToolResolution>();
  const allowedToolAliases = new Map<
    string,
    AllowedToolResolution | 'ambiguous'
  >();

  const recordAllowedTool = (
    toolName: string,
    resolution: AllowedToolResolution,
    canonicalName: string | undefined,
  ) => {
    allowedToolResolutions.set(toolName, resolution);

    if (canonicalName == null || canonicalName === toolName) {
      return;
    }

    const existingAlias = allowedToolAliases.get(canonicalName);

    if (existingAlias == null) {
      allowedToolAliases.set(canonicalName, resolution);
    } else if (
      existingAlias !== 'ambiguous' &&
      !isSameAllowedTool(existingAlias, resolution)
    ) {
      allowedToolAliases.set(canonicalName, 'ambiguous');
    }
  };

  for (const tool of tools) {
    switch (tool.type) {
      case 'function': {
        const openaiOptions = tool.providerOptions?.openai as
          | OpenAIToolOptions
          | undefined;
        if (openaiOptions?.outputSchema != null) {
          outputSchemaToolNames?.add(tool.name);
        }
        const openaiFunctionTool = prepareFunctionTool({
          tool,
          options: openaiOptions,
        });
        const namespace = openaiOptions?.namespace;

        if (namespace == null) {
          openaiTools.push(openaiFunctionTool);
        } else {
          let namespaceTool = namespaceTools.get(namespace.name);

          if (namespaceTool == null) {
            namespaceTool = {
              type: 'namespace',
              name: namespace.name,
              description: namespace.description,
              tools: [],
            };
            namespaceTools.set(namespace.name, namespaceTool);
            openaiTools.push(namespaceTool);
          } else if (namespaceTool.description !== namespace.description) {
            throw new UnsupportedFunctionalityError({
              functionality: `conflicting descriptions for OpenAI tool namespace "${namespace.name}"`,
            });
          }

          namespaceTool.tools.push(openaiFunctionTool);
        }

        recordAllowedTool(
          tool.name,
          namespace != null
            ? {
                supported: false,
                reason:
                  'tools inside an OpenAI tool namespace are not visible to tool_choice.allowed_tools',
              }
            : openaiOptions?.deferLoading === true
              ? {
                  supported: false,
                  reason:
                    'deferred tools are not visible to tool_choice.allowed_tools',
                }
              : {
                  supported: true,
                  entry: { type: 'function', name: tool.name },
                },
          undefined,
        );
        break;
      }
      case 'provider': {
        const openaiToolCountBefore = openaiTools.length;

        switch (tool.id) {
          case 'openai.file_search': {
            const args = await validateTypes({
              value: tool.args,
              schema: fileSearchArgsSchema,
            });

            openaiTools.push({
              type: 'file_search',
              vector_store_ids: args.vectorStoreIds,
              max_num_results: args.maxNumResults,
              ranking_options: args.ranking
                ? {
                    ranker: args.ranking.ranker,
                    score_threshold: args.ranking.scoreThreshold,
                  }
                : undefined,
              filters: args.filters,
            });

            break;
          }
          case 'openai.local_shell': {
            openaiTools.push({
              type: 'local_shell',
            });
            break;
          }
          case 'openai.shell': {
            const args = await validateTypes({
              value: tool.args,
              schema: shellArgsSchema,
            });

            openaiTools.push({
              type: 'shell',
              ...(args.environment && {
                environment: mapShellEnvironment(args.environment),
              }),
            });
            break;
          }
          case 'openai.apply_patch': {
            openaiTools.push({
              type: 'apply_patch',
            });
            break;
          }
          case 'openai.computer': {
            openaiTools.push({
              type: 'computer',
            });
            break;
          }
          case 'openai.web_search_preview': {
            const args = await validateTypes({
              value: tool.args,
              schema: webSearchPreviewArgsSchema,
            });
            openaiTools.push({
              type: 'web_search_preview',
              search_context_size: args.searchContextSize,
              user_location: args.userLocation,
            });
            break;
          }
          case 'openai.web_search': {
            const args = await validateTypes({
              value: tool.args,
              schema: webSearchArgsSchema,
            });
            openaiTools.push({
              type: 'web_search',
              filters:
                args.filters != null
                  ? {
                      allowed_domains: args.filters.allowedDomains,
                      blocked_domains: args.filters.blockedDomains,
                    }
                  : undefined,
              external_web_access: args.externalWebAccess,
              search_context_size: args.searchContextSize,
              user_location: args.userLocation,
            });
            break;
          }
          case 'openai.code_interpreter': {
            const args = await validateTypes({
              value: tool.args,
              schema: codeInterpreterArgsSchema,
            });

            openaiTools.push({
              type: 'code_interpreter',
              container:
                args.container == null
                  ? { type: 'auto', file_ids: undefined }
                  : typeof args.container === 'string'
                    ? args.container
                    : { type: 'auto', file_ids: args.container.fileIds },
            });
            break;
          }
          case 'openai.image_generation': {
            const args = await validateTypes({
              value: tool.args,
              schema: imageGenerationArgsSchema,
            });

            openaiTools.push({
              type: 'image_generation',
              background: args.background,
              input_fidelity: args.inputFidelity,
              input_image_mask: args.inputImageMask
                ? {
                    file_id: args.inputImageMask.fileId,
                    image_url: args.inputImageMask.imageUrl,
                  }
                : undefined,
              model: args.model,
              moderation: args.moderation,
              partial_images: args.partialImages,
              quality: args.quality,
              output_compression: args.outputCompression,
              output_format: args.outputFormat,
              size: args.size,
            });
            break;
          }
          case 'openai.mcp': {
            const args = await validateTypes({
              value: tool.args,
              schema: mcpArgsSchema,
            });

            const mapApprovalFilter = (filter: { toolNames?: string[] }) => ({
              tool_names: filter.toolNames,
            });

            const requireApproval = args.requireApproval;
            const requireApprovalParam:
              | 'always'
              | 'never'
              | {
                  never?: { tool_names?: string[] };
                }
              | undefined =
              requireApproval == null
                ? undefined
                : typeof requireApproval === 'string'
                  ? requireApproval
                  : requireApproval.never != null
                    ? { never: mapApprovalFilter(requireApproval.never) }
                    : undefined;

            openaiTools.push({
              type: 'mcp',
              server_label: args.serverLabel,
              allowed_tools: Array.isArray(args.allowedTools)
                ? args.allowedTools
                : args.allowedTools
                  ? {
                      read_only: args.allowedTools.readOnly,
                      tool_names: args.allowedTools.toolNames,
                    }
                  : undefined,
              authorization: args.authorization,
              connector_id: args.connectorId,
              headers: args.headers,
              require_approval: requireApprovalParam ?? 'never',
              server_description: args.serverDescription,
              server_url: args.serverUrl,
            });

            break;
          }
          case 'openai.custom': {
            const args = await validateTypes({
              value: tool.args,
              schema: customArgsSchema,
            });

            openaiTools.push({
              type: 'custom',
              name: tool.name,
              description: args.description,
              format: args.format,
            });
            resolvedCustomProviderToolNames.add(tool.name);
            break;
          }
          case 'openai.programmatic_tool_calling': {
            openaiTools.push({
              type: 'programmatic_tool_calling',
            });
            break;
          }
          case 'openai.tool_search': {
            const args = await validateTypes({
              value: tool.args,
              schema: toolSearchArgsSchema,
            });
            openaiTools.push({
              type: 'tool_search',
              ...(args.execution != null ? { execution: args.execution } : {}),
              ...(args.description != null
                ? { description: args.description }
                : {}),
              ...(args.parameters != null
                ? { parameters: args.parameters }
                : {}),
            });
            break;
          }
        }

        if (openaiTools.length > openaiToolCountBefore) {
          const openaiTool = openaiTools[openaiToolCountBefore];

          recordAllowedTool(
            tool.name,
            toAllowedToolResolution(openaiTool),
            toolNameMapping?.toProviderToolName(tool.name),
          );
        }
        break;
      }
      default:
        toolWarnings.push({
          type: 'unsupported',
          feature: `function tool ${tool}`,
        });
        break;
    }
  }

  if (allowedTools != null) {
    const allowedToolEntries: Array<OpenAIResponsesAllowedTool> = [];
    const droppedToolNames: string[] = [];

    for (const name of allowedTools.toolNames) {
      const directResolution = allowedToolResolutions.get(name);
      const resolution = directResolution ?? allowedToolAliases.get(name);

      if (directResolution != null && allowedToolAliases.has(name)) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `allowedTools entry "${name}"`,
          details:
            'this name is both a tool name and the provider tool name of another tool in this request; the tool with this name is allowed',
        });
      }

      if (resolution === 'ambiguous') {
        toolWarnings.push({
          type: 'unsupported',
          feature: `allowedTools entry "${name}"`,
          details:
            'several tools in this request share this provider tool name; use the tool name from the tools for this request instead',
        });
        droppedToolNames.push(name);
        continue;
      }

      if (resolution == null) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `allowedTools entry "${name}"`,
          details:
            'the tool is not part of the tools for this request and is sent as a function tool',
        });
        allowedToolEntries.push({
          type: 'function',
          name: toolNameMapping?.toProviderToolName(name) ?? name,
        });
        continue;
      }

      if (!resolution.supported) {
        toolWarnings.push({
          type: 'unsupported',
          feature: `allowedTools entry "${name}"`,
          details: `${resolution.reason}; the tool is removed from the allowed tools`,
        });
        droppedToolNames.push(name);
        continue;
      }

      allowedToolEntries.push(resolution.entry);
    }

    if (allowedToolEntries.length === 0) {
      throw new UnsupportedFunctionalityError({
        functionality: `allowedTools with only tools that cannot be allow-listed (${droppedToolNames.join(
          ', ',
        )})`,
      });
    }

    return {
      tools: openaiTools,
      toolChoice: {
        type: 'allowed_tools',
        mode: allowedTools.mode ?? 'auto',
        tools: allowedToolEntries,
      },
      toolWarnings,
    };
  }

  if (toolChoice == null) {
    return { tools: openaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiTools, toolChoice: type, toolWarnings };
    case 'tool': {
      const resolvedToolName =
        toolNameMapping?.toProviderToolName(toolChoice.toolName) ??
        toolChoice.toolName;

      return {
        tools: openaiTools,
        toolChoice:
          resolvedToolName === 'code_interpreter' ||
          resolvedToolName === 'file_search' ||
          resolvedToolName === 'image_generation' ||
          resolvedToolName === 'web_search_preview' ||
          resolvedToolName === 'web_search' ||
          resolvedToolName === 'mcp' ||
          resolvedToolName === 'apply_patch' ||
          resolvedToolName === 'computer' ||
          resolvedToolName === 'programmatic_tool_calling'
            ? { type: resolvedToolName }
            : resolvedCustomProviderToolNames.has(resolvedToolName)
              ? { type: 'custom', name: resolvedToolName }
              : { type: 'function', name: resolvedToolName },
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

function allowedToolKey(entry: OpenAIResponsesAllowedTool): string {
  switch (entry.type) {
    case 'mcp':
      return `mcp:${entry.server_label}`;
    case 'function':
    case 'custom':
      return `${entry.type}:${entry.name}`;
    default:
      return entry.type;
  }
}

function isSameAllowedTool(
  a: AllowedToolResolution,
  b: AllowedToolResolution,
): boolean {
  if (a.supported && b.supported) {
    return allowedToolKey(a.entry) === allowedToolKey(b.entry);
  }

  if (!a.supported && !b.supported) {
    return a.reason === b.reason;
  }

  return false;
}

function toAllowedToolResolution(
  tool: OpenAIResponsesTool,
): AllowedToolResolution {
  switch (tool.type) {
    case 'custom':
      return { supported: true, entry: { type: 'custom', name: tool.name } };
    case 'mcp':
      return {
        supported: true,
        entry: { type: 'mcp', server_label: tool.server_label },
      };
    case 'file_search':
    case 'web_search':
    case 'web_search_preview':
    case 'image_generation':
    case 'code_interpreter':
    case 'computer':
    case 'apply_patch':
    case 'shell':
    case 'local_shell':
    case 'programmatic_tool_calling':
      return { supported: true, entry: { type: tool.type } };
    default:
      return {
        supported: false,
        reason: `OpenAI does not support ${tool.type} tools in tool_choice.allowed_tools`,
      };
  }
}

function prepareFunctionTool({
  tool,
  options,
}: {
  tool: LanguageModelV4FunctionTool;
  options: OpenAIToolOptions | undefined;
}): OpenAIResponsesFunctionTool {
  const deferLoading = options?.deferLoading;

  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    ...(tool.strict != null ? { strict: tool.strict } : {}),
    ...(deferLoading != null ? { defer_loading: deferLoading } : {}),
    ...(options?.allowedCallers != null
      ? { allowed_callers: options.allowedCallers }
      : {}),
    ...(options?.outputSchema != null
      ? { output_schema: options.outputSchema as JSONSchema7 }
      : {}),
  };
}

function mapShellEnvironment(environment: {
  type?: string;
  [key: string]: unknown;
}): NonNullable<
  Extract<OpenAIResponsesTool, { type: 'shell' }>['environment']
> {
  if (environment.type === 'containerReference') {
    const env = environment as {
      type: 'containerReference';
      containerId: string;
    };
    return {
      type: 'container_reference',
      container_id: env.containerId,
    };
  }

  if (environment.type === 'containerAuto') {
    const env = environment as {
      type: 'containerAuto';
      fileIds?: string[];
      memoryLimit?: '1g' | '4g' | '16g' | '64g';
      networkPolicy?: {
        type: string;
        allowedDomains?: string[];
        domainSecrets?: Array<{
          domain: string;
          name: string;
          value: string;
        }>;
      };
      skills?: Array<{
        type: string;
        providerReference?: SharedV4ProviderReference;
        version?: string;
        name?: string;
        description?: string;
        source?: { type: string; mediaType: string; data: string };
      }>;
    };

    return {
      type: 'container_auto',
      file_ids: env.fileIds,
      memory_limit: env.memoryLimit,
      network_policy:
        env.networkPolicy == null
          ? undefined
          : env.networkPolicy.type === 'disabled'
            ? { type: 'disabled' as const }
            : {
                type: 'allowlist' as const,
                allowed_domains: env.networkPolicy.allowedDomains!,
                domain_secrets: env.networkPolicy.domainSecrets,
              },
      skills: mapShellSkills(env.skills),
    };
  }

  const env = environment as {
    type?: 'local';
    skills?: Array<{
      name: string;
      description: string;
      path: string;
    }>;
  };
  return {
    type: 'local',
    skills: env.skills,
  };
}

function mapShellSkills(
  skills:
    | Array<{
        type: string;
        providerReference?: SharedV4ProviderReference;
        version?: string;
        name?: string;
        description?: string;
        source?: { type: string; mediaType: string; data: string };
      }>
    | undefined,
) {
  return skills?.map(skill =>
    skill.type === 'skillReference'
      ? {
          type: 'skill_reference' as const,
          skill_id: resolveProviderReference({
            reference: skill.providerReference ?? {},
            provider: 'openai',
          }),
          version: skill.version ?? 'latest',
        }
      : {
          type: 'inline' as const,
          name: skill.name!,
          description: skill.description!,
          source: {
            type: 'base64' as const,
            media_type: skill.source!.mediaType as 'application/zip',
            data: skill.source!.data,
          },
        },
  );
}
