import type { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import {
  asSchema,
  safeParseJSON,
  safeValidateTypes,
  type InferToolInput,
  type ModelMessage,
  type ToolSet,
  type ZodSchemaOptions,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { ToolCallRepairError } from '../error/tool-call-repair-error';
import type { Instructions } from '../prompt';
import { getOwn } from '../util/get-own';
import type { DynamicToolCall, TypedToolCall } from './tool-call';
import type { ToolCallRepairFunction } from './tool-call-repair-function';
import type { ToolInputRefinement } from './tool-input-refinement';

export async function parseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  repairToolCall,
  refineToolInput,
  messages,
  instructions,
  abortSignal,
  zodSchemaOptions,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  refineToolInput?: ToolInputRefinement<TOOLS> | undefined;
  instructions: Instructions | undefined;
  messages: ModelMessage[];
  abortSignal?: AbortSignal;
  zodSchemaOptions?: ZodSchemaOptions;
}): Promise<TypedToolCall<TOOLS>> {
  try {
    if (tools == null) {
      // provider-executed dynamic tools are not part of our list of tools:
      if (toolCall.providerExecuted && toolCall.dynamic) {
        return await refineParsedToolCallInput({
          toolCall: await parseProviderExecutedDynamicToolCall(toolCall),
          refineToolInput,
        });
      }

      throw new NoSuchToolError({ toolName: toolCall.toolName });
    }

    try {
      return await refineParsedToolCallInput({
        toolCall: await doParseToolCall({ toolCall, tools, zodSchemaOptions }),
        refineToolInput,
      });
    } catch (error) {
      if (
        repairToolCall == null ||
        !(
          NoSuchToolError.isInstance(error) ||
          InvalidToolInputError.isInstance(error)
        )
      ) {
        throw error;
      }

      let repairedToolCall: LanguageModelV4ToolCall | null = null;

      try {
        abortSignal?.throwIfAborted();
        repairedToolCall = await waitForPromiseWithAbortSignal({
          promise: repairToolCall({
            toolCall,
            tools,
            inputSchema: async ({ toolName }) => {
              const inputSchema = getOwn(tools, toolName)?.inputSchema;
              return await asSchema(inputSchema, zodSchemaOptions).jsonSchema;
            },
            instructions,
            system: instructions,
            messages,
            error,
            abortSignal,
          }),
          abortSignal,
        });
      } catch (repairError) {
        abortSignal?.throwIfAborted();
        throw new ToolCallRepairError({
          cause: repairError,
          originalError: error,
        });
      }

      // no repaired tool call returned
      if (repairedToolCall == null) {
        throw error;
      }

      const parsedRepairedToolCall = await refineParsedToolCallInput({
        toolCall: await doParseToolCall({
          toolCall: repairedToolCall,
          tools,
          zodSchemaOptions,
        }),
        refineToolInput,
      });

      abortSignal?.throwIfAborted();

      return parsedRepairedToolCall;
    }
  } catch (error) {
    abortSignal?.throwIfAborted();

    // use parsed input when possible
    const parsedInput = await safeParseJSON({ text: toolCall.input });
    const input = parsedInput.success ? parsedInput.value : toolCall.input;
    const tool = getOwn(tools, toolCall.toolName);

    // TODO AI SDK 6: special invalid tool call parts
    return {
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input,
      dynamic: true,
      invalid: true,
      error,
      title: tool?.title,
      providerExecuted: toolCall.providerExecuted,
      providerMetadata: toolCall.providerMetadata,
      ...(tool?.metadata != null ? { toolMetadata: tool.metadata } : {}),
    };
  }
}

async function waitForPromiseWithAbortSignal<T>({
  promise,
  abortSignal,
}: {
  promise: PromiseLike<T>;
  abortSignal: AbortSignal | undefined;
}): Promise<T> {
  if (abortSignal == null) {
    return await promise;
  }

  return await new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      abortSignal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(abortSignal.reason);
    };

    Promise.resolve(promise)
      .then(value => {
        cleanup();
        resolve(value);
      })
      .catch(error => {
        cleanup();
        reject(error);
      });

    abortSignal.addEventListener('abort', onAbort, { once: true });

    if (abortSignal.aborted) {
      onAbort();
    }
  });
}

async function refineParsedToolCallInput<TOOLS extends ToolSet>({
  toolCall,
  refineToolInput,
}: {
  toolCall: TypedToolCall<TOOLS>;
  refineToolInput: ToolInputRefinement<TOOLS> | undefined;
}): Promise<TypedToolCall<TOOLS>> {
  const refine = getOwn(refineToolInput, toolCall.toolName);

  if (refine == null) {
    return toolCall;
  }

  return {
    ...toolCall,
    input: await refine(toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>),
  } as TypedToolCall<TOOLS>;
}

async function parseProviderExecutedDynamicToolCall(
  toolCall: LanguageModelV4ToolCall,
): Promise<DynamicToolCall> {
  const parseResult =
    toolCall.input.trim() === ''
      ? { success: true as const, value: {} }
      : await safeParseJSON({ text: toolCall.input });

  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName: toolCall.toolName,
      toolInput: toolCall.input,
      cause: parseResult.error,
    });
  }

  return {
    type: 'tool-call',
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: parseResult.value,
    providerExecuted: true,
    dynamic: true,
    providerMetadata: toolCall.providerMetadata,
  };
}

async function doParseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  zodSchemaOptions,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS;
  zodSchemaOptions?: ZodSchemaOptions;
}): Promise<TypedToolCall<TOOLS>> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  const tool = getOwn(tools, toolName);

  if (tool == null) {
    // provider-executed dynamic tools are not part of our list of tools:
    if (toolCall.providerExecuted && toolCall.dynamic) {
      return await parseProviderExecutedDynamicToolCall(toolCall);
    }

    throw new NoSuchToolError({
      toolName: toolCall.toolName,
      availableTools: Object.keys(tools),
    });
  }

  const schema = asSchema(tool.inputSchema, zodSchemaOptions);

  // when the tool call has no arguments, we try passing an empty object to the schema
  // (many LLMs generate empty strings for tool calls with no arguments)
  const parseResult =
    toolCall.input.trim() === ''
      ? await safeValidateTypes({ value: {}, schema })
      : await safeParseJSON({ text: toolCall.input, schema });

  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName,
      toolInput: toolCall.input,
      cause: parseResult.error,
    });
  }

  return tool.type === 'dynamic'
    ? {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: parseResult.value,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        ...(tool.metadata != null ? { toolMetadata: tool.metadata } : {}),
        dynamic: true,
        title: tool.title,
      }
    : {
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName,
        input: parseResult.value,
        providerExecuted: toolCall.providerExecuted,
        providerMetadata: toolCall.providerMetadata,
        ...(tool.metadata != null ? { toolMetadata: tool.metadata } : {}),
        title: tool.title,
      };
}
