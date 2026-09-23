import type { LanguageModelV3ToolCall } from '@ai-sdk/provider';
import {
  asSchema,
  safeParseJSON,
  safeValidateTypes,
  type ModelMessage,
  type SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError } from '../error/invalid-tool-input-error';
import { NoSuchToolError } from '../error/no-such-tool-error';
import { ToolCallRepairError } from '../error/tool-call-repair-error';
<<<<<<< HEAD
import type { DynamicToolCall, TypedToolCall } from './tool-call';
=======
import type { Instructions } from '../prompt';
import { getOwn } from '../util/get-own';
import {
  getToolCallInputSchemaInput,
  setToolCallInputSchemaInput,
  type DynamicToolCall,
  type TypedToolCall,
} from './tool-call';
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
import type { ToolCallRepairFunction } from './tool-call-repair-function';
import type { ToolSet } from './tool-set';

export async function parseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  repairToolCall,
  system,
  messages,
}: {
  toolCall: LanguageModelV3ToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  messages: ModelMessage[];
}): Promise<TypedToolCall<TOOLS>> {
  try {
    if (tools == null) {
      // provider-executed dynamic tools are not part of our list of tools:
      if (toolCall.providerExecuted && toolCall.dynamic) {
        return await parseProviderExecutedDynamicToolCall(toolCall);
      }

      throw new NoSuchToolError({ toolName: toolCall.toolName });
    }

    try {
      return await doParseToolCall({ toolCall, tools });
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

      let repairedToolCall: LanguageModelV3ToolCall | null = null;

      try {
        repairedToolCall = await repairToolCall({
          toolCall,
          tools,
          inputSchema: async ({ toolName }) => {
            const { inputSchema } = tools[toolName];
            return await asSchema(inputSchema).jsonSchema;
          },
          system,
          messages,
          error,
        });
      } catch (repairError) {
        throw new ToolCallRepairError({
          cause: repairError,
          originalError: error,
        });
      }

      // no repaired tool call returned
      if (repairedToolCall == null) {
        throw error;
      }

      return await doParseToolCall({ toolCall: repairedToolCall, tools });
    }
  } catch (error) {
    // use parsed input when possible
    const parsedInput = await safeParseJSON({ text: toolCall.input });
    const input = parsedInput.success ? parsedInput.value : toolCall.input;
    const tool = tools?.[toolCall.toolName];

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

<<<<<<< HEAD
=======
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

export async function refineParsedToolCallInput<TOOLS extends ToolSet>({
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

  const refinedToolCall = {
    ...toolCall,
    input: await refine(toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>),
  } as TypedToolCall<TOOLS>;

  const inputSchemaInput = getToolCallInputSchemaInput(toolCall);
  return inputSchemaInput == null
    ? refinedToolCall
    : setToolCallInputSchemaInput(refinedToolCall, inputSchemaInput.value);
}

>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
async function parseProviderExecutedDynamicToolCall(
  toolCall: LanguageModelV3ToolCall,
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
}: {
  toolCall: LanguageModelV3ToolCall;
  tools: TOOLS;
}): Promise<TypedToolCall<TOOLS>> {
  const toolName = toolCall.toolName as keyof TOOLS & string;

  const tool = tools[toolName];

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

  const schema = asSchema(tool.inputSchema);

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

  return setToolCallInputSchemaInput(
    tool.type === 'dynamic'
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
        },
    parseResult.rawValue,
  );
}
