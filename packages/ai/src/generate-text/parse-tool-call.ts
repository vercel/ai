import type { LanguageModelV4ToolCall } from '@ai-sdk/provider';
import {
  asSchema,
  InvalidToolInputError,
  NoSuchToolError,
  safeParseJSON,
  validateToolCall,
  type InferToolInput,
  type ModelMessage,
  type ToolSet,
  type TypedToolCall,
} from '@ai-sdk/provider-utils';
import { ToolCallRepairError } from '../error/tool-call-repair-error';
import type { Instructions } from '../prompt';
import type { ToolCallRepairFunction } from './tool-call-repair-function';
import type { ToolInputRefinement } from './tool-input-refinement';

export async function parseToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  repairToolCall,
  refineToolInput,
  messages,
  instructions,
}: {
  toolCall: LanguageModelV4ToolCall;
  tools: TOOLS | undefined;
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
  refineToolInput?: ToolInputRefinement<TOOLS> | undefined;
  instructions: Instructions | undefined;
  messages: ModelMessage[];
}): Promise<TypedToolCall<TOOLS>> {
  try {
    try {
      return await refineParsedToolCallInput({
        toolCall: await validateToolCall({ toolCall, tools }),
        refineToolInput,
      });
    } catch (error) {
      if (
        repairToolCall == null ||
        tools == null ||
        !(
          NoSuchToolError.isInstance(error) ||
          InvalidToolInputError.isInstance(error)
        )
      ) {
        throw error;
      }

      let repairedToolCall: LanguageModelV4ToolCall | null = null;

      try {
        repairedToolCall = await repairToolCall({
          toolCall,
          tools,
          inputSchema: async ({ toolName }) => {
            const { inputSchema } = tools[toolName];
            return await asSchema(inputSchema).jsonSchema;
          },
          instructions,
          system: instructions,
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

      return await refineParsedToolCallInput({
        toolCall: await validateToolCall({ toolCall: repairedToolCall, tools }),
        refineToolInput,
      });
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

async function refineParsedToolCallInput<TOOLS extends ToolSet>({
  toolCall,
  refineToolInput,
}: {
  toolCall: TypedToolCall<TOOLS>;
  refineToolInput: ToolInputRefinement<TOOLS> | undefined;
}): Promise<TypedToolCall<TOOLS>> {
  const refine = refineToolInput?.[toolCall.toolName];

  if (refine == null) {
    return toolCall;
  }

  return {
    ...toolCall,
    input: await refine(toolCall.input as InferToolInput<TOOLS[keyof TOOLS]>),
  } as TypedToolCall<TOOLS>;
}
