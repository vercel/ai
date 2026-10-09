import {
  type LanguageModelV2CallWarning,
  type LanguageModelV2Prompt,
  type LanguageModelV2ToolCallPart,
  type SharedV2ProviderOptions,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  parseProviderOptions,
<<<<<<< HEAD
=======
  resolveFullMediaType,
  resolveProviderReference,
  safeValidateTypes,
>>>>>>> 6aedb07c54 (fix: preserve web search context across stateless OpenAI Responses steps (#22346))
  validateTypes,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { openaiResponsesSystemMessageOptionsSchema } from './openai-responses-options';
import {
  localShellInputSchema,
  localShellOutputSchema,
} from '../tool/local-shell';
import { webSearchOutputSchema } from '../tool/web-search';
import type {
  OpenAIResponsesFunctionCallOutput,
  OpenAIResponsesInput,
  OpenAIResponsesReasoning,
<<<<<<< HEAD
} from './openai-responses-api';
=======
  OpenAIResponsesToolCaller,
  OpenAIResponsesWebSearchCall,
} from './openai-responses-api';
import {
  toolSearchInputSchema,
  toolSearchOutputSchema,
} from '../tool/tool-search';
import {
  programmaticToolCallingInputSchema,
  programmaticToolCallingOutputSchema,
} from '../tool/programmatic-tool-calling';
import { webSearchOutputSchema } from '../tool/web-search';
import {
  getParallelToolCallMetadata,
  type ParallelToolCallMetadata,
} from './expand-parallel-tool-call';

function serializeToolCallArguments(input: unknown): string {
  return JSON.stringify(input === undefined ? {} : input);
}

function mapToolCaller(
  caller:
    | { type: 'direct' }
    | { type: 'program'; callerId: string }
    | undefined,
): OpenAIResponsesToolCaller | undefined {
  return caller == null
    ? undefined
    : caller.type === 'program'
      ? { type: 'program', caller_id: caller.callerId }
      : caller;
}

async function convertWebSearchToolResultOutput({
  output,
  id,
}: {
  output: LanguageModelV4ToolResultOutput;
  id: string;
}): Promise<OpenAIResponsesWebSearchCall | undefined> {
  if (output.type !== 'json') {
    return undefined;
  }

  const validation = await safeValidateTypes({
    value: output.value,
    schema: webSearchOutputSchema,
  });

  if (!validation.success || validation.value.action == null) {
    return undefined;
  }

  const { action, sources } = validation.value;

  switch (action.type) {
    case 'search':
      return {
        type: 'web_search_call',
        id,
        status: 'completed',
        action: {
          type: 'search',
          ...(action.query != null && { query: action.query }),
          ...(action.queries != null && { queries: action.queries }),
          ...(sources != null && { sources }),
        },
      };
    case 'openPage':
      return {
        type: 'web_search_call',
        id,
        status: 'completed',
        action: {
          type: 'open_page',
          url: action.url,
        },
      };
    case 'findInPage':
      return {
        type: 'web_search_call',
        id,
        status: 'completed',
        action: {
          type: 'find_in_page',
          url: action.url,
          pattern: action.pattern,
        },
      };
  }
}

async function convertFunctionToolResultOutput({
  output,
  toolName,
  outputSchemaToolNames,
  promptCacheBreakpoint,
  providerOptionsName,
  warnings,
}: {
  output: LanguageModelV4ToolResultOutput;
  toolName: string;
  outputSchemaToolNames: Set<string> | undefined;
  promptCacheBreakpoint?: OpenAIPromptCacheBreakpoint;
  providerOptionsName: string;
  warnings: Array<SharedV4Warning>;
}): Promise<OpenAIResponsesFunctionCallOutput['output']> {
  // `output` is always a string, but for functions with output_schema OpenAI
  // parses the contents of that string as JSON. Text-like results therefore
  // need JSON.stringify to become valid JSON string literals.
  const hasOutputSchema = outputSchemaToolNames?.has(toolName);
  const convertScalarOutput = (
    value: string,
  ): OpenAIResponsesFunctionCallOutput['output'] =>
    promptCacheBreakpoint == null
      ? value
      : [
          {
            type: 'input_text',
            text: value,
            prompt_cache_breakpoint: promptCacheBreakpoint,
          },
        ];

  switch (output.type) {
    case 'text':
      return convertScalarOutput(
        hasOutputSchema ? JSON.stringify(output.value) : output.value,
      );
    case 'error-text':
    case 'error-json':
      return convertScalarOutput(JSON.stringify({ error: output.value }));
    case 'execution-denied': {
      const reason = output.reason ?? 'Tool call execution denied.';
      return convertScalarOutput(
        hasOutputSchema ? JSON.stringify(reason) : reason,
      );
    }
    case 'json':
      return convertScalarOutput(JSON.stringify(output.value));
    case 'content':
      return output.value
        .map(item => {
          const promptCacheBreakpoint = getPromptCacheBreakpoint(
            item.providerOptions,
            providerOptionsName,
          );
          switch (item.type) {
            case 'text': {
              return {
                type: 'input_text' as const,
                text: item.text,
                ...(promptCacheBreakpoint != null && {
                  prompt_cache_breakpoint: promptCacheBreakpoint,
                }),
              };
            }

            case 'file': {
              const topLevel = getTopLevelMediaType(item.mediaType);
              const imageDetail =
                item.providerOptions?.[providerOptionsName]?.imageDetail;

              if (item.data.type === 'reference') {
                const fileId = resolveProviderReference({
                  reference: item.data.reference,
                  provider: providerOptionsName,
                });

                if (topLevel === 'image') {
                  return {
                    type: 'input_image' as const,
                    file_id: fileId,
                    detail: imageDetail,
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                }

                return {
                  type: 'input_file' as const,
                  file_id: fileId,
                  ...(promptCacheBreakpoint != null && {
                    prompt_cache_breakpoint: promptCacheBreakpoint,
                  }),
                };
              }

              if (item.data.type === 'data') {
                const fullMediaType = resolveFullMediaType({ part: item });
                if (topLevel === 'image') {
                  return {
                    type: 'input_image' as const,
                    image_url: `data:${fullMediaType};base64,${convertToBase64(item.data.data)}`,
                    detail: imageDetail,
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                }
                return {
                  type: 'input_file' as const,
                  filename: item.filename ?? 'data',
                  file_data: `data:${fullMediaType};base64,${convertToBase64(item.data.data)}`,
                  ...(promptCacheBreakpoint != null && {
                    prompt_cache_breakpoint: promptCacheBreakpoint,
                  }),
                };
              }

              if (item.data.type === 'url') {
                if (topLevel === 'image') {
                  return {
                    type: 'input_image' as const,
                    image_url: item.data.url.toString(),
                    detail: imageDetail,
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                }
                return {
                  type: 'input_file' as const,
                  file_url: item.data.url.toString(),
                  ...(promptCacheBreakpoint != null && {
                    prompt_cache_breakpoint: promptCacheBreakpoint,
                  }),
                };
              }

              warnings.push({
                type: 'other',
                message: `unsupported tool content part type: ${item.type} with data type: ${item.data.type}`,
              });
              return undefined;
            }

            default: {
              warnings.push({
                type: 'other',
                message: `unsupported tool content part type: ${item.type}`,
              });
              return undefined;
            }
          }
        })
        .filter(isNonNullable);
  }
}

type ParallelToolResultGroup = {
  metadata: ParallelToolCallMetadata;
  results: Array<LanguageModelV4ToolResultPart>;
};

function hasSameParallelToolCall(
  first: ParallelToolCallMetadata,
  second: ParallelToolCallMetadata,
): boolean {
  return (
    first.itemId === second.itemId &&
    first.toolCallId === second.toolCallId &&
    first.toolName === second.toolName &&
    first.input === second.input &&
    first.count === second.count
  );
}

function collectCompleteParallelToolResultGroups({
  prompt,
  providerOptionsName,
}: {
  prompt: LanguageModelV4Prompt;
  providerOptionsName: string;
}): Map<string, ParallelToolResultGroup> {
  const pendingGroups = new Map<
    string,
    {
      metadata: ParallelToolCallMetadata;
      results: Map<number, LanguageModelV4ToolResultPart>;
      invalid: boolean;
    }
  >();

  for (const message of prompt) {
    if (message.role !== 'tool') {
      continue;
    }

    for (const part of message.content) {
      if (part.type !== 'tool-result') {
        continue;
      }

      const metadata = getParallelToolCallMetadata({
        providerOptions: part.providerOptions,
        providerOptionsName,
      });

      if (metadata == null) {
        continue;
      }

      const existing = pendingGroups.get(metadata.toolCallId);
      if (existing == null) {
        pendingGroups.set(metadata.toolCallId, {
          metadata,
          results: new Map([[metadata.index, part]]),
          invalid: false,
        });
        continue;
      }

      if (
        !hasSameParallelToolCall(existing.metadata, metadata) ||
        existing.results.has(metadata.index)
      ) {
        existing.invalid = true;
        continue;
      }

      existing.results.set(metadata.index, part);
    }
  }

  const completeGroups = new Map<string, ParallelToolResultGroup>();

  for (const [toolCallId, group] of pendingGroups) {
    if (group.invalid || group.results.size !== group.metadata.count) {
      continue;
    }

    const results = Array.from({ length: group.metadata.count }, (_, index) =>
      group.results.get(index),
    );

    if (results.every(isNonNullable)) {
      completeGroups.set(toolCallId, {
        metadata: group.metadata,
        results,
      });
    }
  }

  return completeGroups;
}
>>>>>>> 6aedb07c54 (fix: preserve web search context across stateless OpenAI Responses steps (#22346))

type OpenAIPromptCacheBreakpoint = { mode: 'explicit' };

function getPromptCacheBreakpoint(
  providerOptions: SharedV2ProviderOptions | undefined,
): OpenAIPromptCacheBreakpoint | undefined {
  return providerOptions?.openai?.promptCacheBreakpoint as
    | OpenAIPromptCacheBreakpoint
    | undefined;
}

/**
 * Check if a string is a file ID based on the given prefixes
 * Returns false if prefixes is undefined (disables file ID detection)
 */
function isFileId(data: string, prefixes?: readonly string[]): boolean {
  if (!prefixes) return false;
  return prefixes.some(prefix => data.startsWith(prefix));
}

export async function convertToOpenAIResponsesInput({
  prompt,
  systemMessageMode,
  providerOptionsName = 'openai',
  explicitMessageItemType = false,
  fileIdPrefixes,
  store,
  configurationUpdateUnsupportedReason,
  hasLocalShellTool = false,
}: {
  prompt: LanguageModelV2Prompt;
  systemMessageMode: 'system' | 'developer' | 'remove';
  providerOptionsName?: string;
  explicitMessageItemType?: boolean;
  fileIdPrefixes?: readonly string[];
  store: boolean;
  configurationUpdateUnsupportedReason?: string;
  hasLocalShellTool?: boolean;
}): Promise<{
  input: OpenAIResponsesInput;
  warnings: Array<LanguageModelV2CallWarning>;
}> {
  let input: OpenAIResponsesInput = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

  for (const { role, content, providerOptions } of prompt) {
    switch (role) {
      case 'system': {
        // Keep effort updates at their original positions so they apply to
        // the same parts of the conversation when the history is sent again.
        let options = await parseProviderOptions({
          provider: providerOptionsName,
          providerOptions,
          schema: openaiResponsesSystemMessageOptionsSchema,
        });
        if (options == null && providerOptionsName !== 'openai') {
          options = await parseProviderOptions({
            provider: 'openai',
            providerOptions,
            schema: openaiResponsesSystemMessageOptionsSchema,
          });
        }
        const effort = options?.reasoningEffortUpdate;
        if (effort != null) {
          const unsupportedReason =
            content !== ''
              ? 'Message-level reasoningEffortUpdate requires empty system message content.'
              : configurationUpdateUnsupportedReason;

          if (unsupportedReason != null) {
            throw new UnsupportedFunctionalityError({
              functionality: 'Message-level reasoningEffortUpdate',
              message: unsupportedReason,
            });
          }

          input.push({
            type: 'configuration_update',
            reasoning: { effort },
          });
          // The control is independent of systemMessageMode's text handling.
          break;
        }

        switch (systemMessageMode) {
          case 'system': {
            const promptCacheBreakpoint =
              getPromptCacheBreakpoint(providerOptions);
            input.push({
              ...(explicitMessageItemType && { type: 'message' as const }),
              role: 'system',
              content:
                promptCacheBreakpoint == null
                  ? content
                  : [
                      {
                        type: 'input_text',
                        text: content,
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ],
            });
            break;
          }
          case 'developer': {
            const promptCacheBreakpoint =
              getPromptCacheBreakpoint(providerOptions);
            input.push({
              ...(explicitMessageItemType && { type: 'message' as const }),
              role: 'developer',
              content:
                promptCacheBreakpoint == null
                  ? content
                  : [
                      {
                        type: 'input_text',
                        text: content,
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ],
            });
            break;
          }
          case 'remove': {
            warnings.push({
              type: 'other',
              message: 'system messages are removed for this model',
            });
            break;
          }
          default: {
            const _exhaustiveCheck: never = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`,
            );
          }
        }
        break;
      }

      case 'user': {
        input.push({
          ...(explicitMessageItemType && { type: 'message' as const }),
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text': {
                const promptCacheBreakpoint = getPromptCacheBreakpoint(
                  part.providerOptions,
                );
                return {
                  type: 'input_text',
                  text: part.text,
                  ...(promptCacheBreakpoint != null && {
                    prompt_cache_breakpoint: promptCacheBreakpoint,
                  }),
                };
              }
              case 'file': {
                const promptCacheBreakpoint = getPromptCacheBreakpoint(
                  part.providerOptions,
                );
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

                  return {
                    type: 'input_image',
                    ...(part.data instanceof URL
                      ? { image_url: part.data.toString() }
                      : typeof part.data === 'string' &&
                          isFileId(part.data, fileIdPrefixes)
                        ? { file_id: part.data }
                        : {
                            image_url: `data:${mediaType};base64,${convertToBase64(part.data)}`,
                          }),
                    detail: part.providerOptions?.openai?.imageDetail,
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                } else if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    return {
                      type: 'input_file',
                      file_url: part.data.toString(),
                      ...(promptCacheBreakpoint != null && {
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      }),
                    };
                  }
                  return {
                    type: 'input_file',
                    ...(typeof part.data === 'string' &&
                    isFileId(part.data, fileIdPrefixes)
                      ? { file_id: part.data }
                      : {
                          filename: part.filename ?? `part-${index}.pdf`,
                          file_data: `data:application/pdf;base64,${convertToBase64(part.data)}`,
                        }),
                    ...(promptCacheBreakpoint != null && {
                      prompt_cache_breakpoint: promptCacheBreakpoint,
                    }),
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
                }
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
        const reasoningMessages: Record<string, OpenAIResponsesReasoning> = {};
        const toolCallParts: Record<string, LanguageModelV2ToolCallPart> = {};

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              const id = part.providerOptions?.openai?.itemId as
                | string
                | undefined;
              const phase = part.providerOptions?.openai?.phase as
                | 'commentary'
                | 'final_answer'
                | null
                | undefined;

              // item references reduce the payload size
              if (store && id != null) {
                input.push({ type: 'item_reference', id });
                break;
              }

              input.push({
                ...(explicitMessageItemType && { type: 'message' as const }),
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
                id,
                ...(phase != null && { phase }),
              });

              break;
            }
            case 'tool-call': {
              toolCallParts[part.toolCallId] = part;

              if (part.providerExecuted) {
                break;
              }

              const id = part.providerOptions?.openai?.itemId as
                | string
                | undefined;
              const isAsync = part.providerOptions?.openai?.async as
                | boolean
                | undefined;

              // item references reduce the payload size
              if (store && id != null) {
                input.push({ type: 'item_reference', id });
                break;
              }

              if (hasLocalShellTool && part.toolName === 'local_shell') {
                const parsedInput = await validateTypes({
                  value: part.input,
                  schema: localShellInputSchema,
                });
                input.push({
                  type: 'local_shell_call',
                  call_id: part.toolCallId,
                  id: id!,
                  action: {
                    type: 'exec',
                    command: parsedInput.action.command,
                    timeout_ms: parsedInput.action.timeoutMs,
                    user: parsedInput.action.user,
                    working_directory: parsedInput.action.workingDirectory,
                    env: parsedInput.action.env,
                  },
                });

                break;
              }

              input.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
                ...(isAsync != null && { async: isAsync }),
                id,
              });
              break;
            }

            // assistant tool result parts are from provider-executed tools:
            case 'tool-result': {
<<<<<<< HEAD
=======
              // Skip execution-denied results - these are synthetic results from denied
              // approvals and have no corresponding item in OpenAI's store.
              // Check both the direct type and if it was transformed to json with execution-denied inside
              if (
                part.output.type === 'execution-denied' ||
                (part.output.type === 'json' &&
                  typeof part.output.value === 'object' &&
                  part.output.value != null &&
                  'type' in part.output.value &&
                  part.output.value.type === 'execution-denied')
              ) {
                break;
              }

              if (hasConversation) {
                break;
              }

              const resolvedResultToolName = toolNameMapping.toProviderToolName(
                part.toolName,
              );

              if (
                resolvedResultToolName === 'web_search' ||
                resolvedResultToolName === 'web_search_preview'
              ) {
                const itemId =
                  (
                    part.providerOptions?.[providerOptionsName] as
                      | { itemId?: string }
                      | undefined
                  )?.itemId ?? part.toolCallId;

                if (store) {
                  input.push({ type: 'item_reference', id: itemId });
                  break;
                }

                const webSearchCall = await convertWebSearchToolResultOutput({
                  output: part.output,
                  id: itemId,
                });

                if (webSearchCall != null) {
                  input.push(webSearchCall);
                  break;
                }
              }

              if (part.toolName === toolSearchToolName) {
                const itemId = (part.providerOptions?.[providerOptionsName]
                  ?.itemId ??
                  (
                    part as {
                      providerMetadata?: {
                        [providerOptionsName]?: { itemId?: string };
                      };
                    }
                  ).providerMetadata?.[providerOptionsName]?.itemId ??
                  part.toolCallId) as string;

                if (store) {
                  input.push({ type: 'item_reference', id: itemId });
                } else if (part.output.type === 'json') {
                  const parsedOutput = await validateTypes({
                    value: part.output.value,
                    schema: toolSearchOutputSchema,
                  });

                  input.push({
                    type: 'tool_search_output',
                    id: itemId,
                    execution: 'server',
                    call_id: null,
                    status: 'completed',
                    tools: parsedOutput.tools,
                  });
                }

                break;
              }

              if (resolvedResultToolName === 'programmatic_tool_calling') {
                const itemId = (part.providerOptions?.[providerOptionsName]
                  ?.itemId ??
                  (
                    part as {
                      providerMetadata?: {
                        [providerOptionsName]?: { itemId?: string };
                      };
                    }
                  ).providerMetadata?.[providerOptionsName]?.itemId ??
                  part.toolCallId) as string;

                if (store) {
                  input.push({ type: 'item_reference', id: itemId });
                } else if (part.output.type === 'json') {
                  const parsedOutput = await validateTypes({
                    value: part.output.value,
                    schema: programmaticToolCallingOutputSchema,
                  });

                  input.push({
                    type: 'program_output',
                    id: itemId,
                    call_id: part.toolCallId,
                    result: parsedOutput.result,
                    status: parsedOutput.status,
                  });
                }
                break;
              }

              /*
               * Shell tool results are separate output items (shell_call_output)
               * with their own item IDs distinct from the shell_call's item ID.
               * Since the pipeline only preserves the shell_call's item ID in
               * callProviderMetadata, we reconstruct the full shell_call_output
               * instead of using an item_reference with the wrong ID.
               */
              if (hasShellTool && resolvedResultToolName === 'shell') {
                if (part.output.type === 'json') {
                  const parsedOutput = await validateTypes({
                    value: part.output.value,
                    schema: shellOutputSchema,
                  });
                  input.push({
                    type: 'shell_call_output',
                    call_id: part.toolCallId,
                    output: parsedOutput.output.map(item => ({
                      stdout: item.stdout,
                      stderr: item.stderr,
                      outcome:
                        item.outcome.type === 'timeout'
                          ? { type: 'timeout' as const }
                          : {
                              type: 'exit' as const,
                              exit_code: item.outcome.exitCode,
                            },
                    })),
                  });
                }
                break;
              }

>>>>>>> 6aedb07c54 (fix: preserve web search context across stateless OpenAI Responses steps (#22346))
              if (store) {
                // use item references to refer to tool results from built-in tools
                input.push({ type: 'item_reference', id: part.toolCallId });
              } else {
                warnings.push({
                  type: 'other',
                  message: `Results for OpenAI tool ${part.toolName} are not sent to the API when store is false`,
                });
              }

              break;
            }

            case 'reasoning': {
              const providerOptions = await parseProviderOptions({
                provider: 'openai',
                providerOptions: part.providerOptions,
                schema: openaiResponsesReasoningProviderOptionsSchema,
              });

              const reasoningId = providerOptions?.itemId;

              if (reasoningId != null) {
                const reasoningMessage = reasoningMessages[reasoningId];

                if (store) {
                  // use item references to refer to reasoning (single reference)
                  // when the first part is encountered
                  if (reasoningMessage === undefined) {
                    input.push({ type: 'item_reference', id: reasoningId });

                    // store unused reasoning message to mark id as used
                    reasoningMessages[reasoningId] = {
                      type: 'reasoning',
                      id: reasoningId,
                      summary: [],
                    };
                  }
                } else {
                  const summaryParts: Array<{
                    type: 'summary_text';
                    text: string;
                  }> = [];

                  if (part.text.length > 0) {
                    summaryParts.push({
                      type: 'summary_text',
                      text: part.text,
                    });
                  } else if (reasoningMessage !== undefined) {
                    warnings.push({
                      type: 'other',
                      message: `Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: ${JSON.stringify(part)}.`,
                    });
                  }

                  if (reasoningMessage === undefined) {
                    reasoningMessages[reasoningId] = {
                      type: 'reasoning',
                      id: reasoningId,
                      encrypted_content:
                        providerOptions?.reasoningEncryptedContent,
                      summary: summaryParts,
                    };
                    input.push(reasoningMessages[reasoningId]);
                  } else {
                    reasoningMessage.summary.push(...summaryParts);

                    // updated encrypted content to enable setting it in the last summary part:
                    if (providerOptions?.reasoningEncryptedContent != null) {
                      reasoningMessage.encrypted_content =
                        providerOptions.reasoningEncryptedContent;
                    }
                  }
                }
              } else {
                warnings.push({
                  type: 'other',
                  message: `Non-OpenAI reasoning parts are not supported. Skipping reasoning part: ${JSON.stringify(part)}.`,
                });
              }
              break;
            }
          }
        }

        break;
      }

      case 'tool': {
        for (const part of content) {
          const output = part.output;
          const promptCacheBreakpoint = getPromptCacheBreakpoint(
            part.providerOptions,
          );

          if (
            hasLocalShellTool &&
            part.toolName === 'local_shell' &&
            output.type === 'json'
          ) {
            const parsedOutput = await validateTypes({
              value: output.value,
              schema: localShellOutputSchema,
            });

            input.push({
              type: 'local_shell_call_output',
              call_id: part.toolCallId,
              output: parsedOutput.output,
            });
            break;
          }

          let contentValue: OpenAIResponsesFunctionCallOutput['output'];
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue =
                promptCacheBreakpoint == null
                  ? output.value
                  : [
                      {
                        type: 'input_text',
                        text: output.value,
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ];
              break;
            case 'json':
            case 'error-json':
              contentValue =
                promptCacheBreakpoint == null
                  ? JSON.stringify(output.value)
                  : [
                      {
                        type: 'input_text',
                        text: JSON.stringify(output.value),
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      },
                    ];
              break;
            case 'content':
              contentValue = output.value.map((item, index) => {
                const isBreakpoint =
                  promptCacheBreakpoint != null &&
                  index === output.value.length - 1;
                switch (item.type) {
                  case 'text': {
                    return {
                      type: 'input_text' as const,
                      text: item.text,
                      ...(isBreakpoint && {
                        prompt_cache_breakpoint: promptCacheBreakpoint,
                      }),
                    };
                  }
                  case 'media': {
                    return item.mediaType.startsWith('image/')
                      ? {
                          type: 'input_image' as const,
                          image_url: `data:${item.mediaType};base64,${item.data}`,
                          ...(isBreakpoint && {
                            prompt_cache_breakpoint: promptCacheBreakpoint,
                          }),
                        }
                      : {
                          type: 'input_file' as const,
                          filename: 'data',
                          file_data: `data:${item.mediaType};base64,${item.data}`,
                          ...(isBreakpoint && {
                            prompt_cache_breakpoint: promptCacheBreakpoint,
                          }),
                        };
                  }
                }
              });
              break;
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: contentValue,
          });
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  // when store is false, remove reasoning parts without encrypted content
  if (
    !store &&
    input.some(
      item =>
        'type' in item &&
        item.type === 'reasoning' &&
        item.encrypted_content == null,
    )
  ) {
    warnings.push({
      type: 'other',
      message:
        'Reasoning parts without encrypted content are not supported when store is false. Skipping reasoning parts.',
    });
    input = input.filter(
      item =>
        !('type' in item) ||
        item.type !== 'reasoning' ||
        item.encrypted_content != null,
    );
  }

  return { input, warnings };
}

const openaiResponsesReasoningProviderOptionsSchema = z.object({
  itemId: z.string().nullish(),
  reasoningEncryptedContent: z.string().nullish(),
});

export type OpenAIResponsesReasoningProviderOptions = z.infer<
  typeof openaiResponsesReasoningProviderOptionsSchema
>;
