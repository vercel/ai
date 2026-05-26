import {
  asSchema,
  executeTool,
  isExecutableTool,
  type ToolSet,
} from '@ai-sdk/provider-utils';

export async function executeRealtimeTool({
  tools,
  name,
  arguments: args,
  callId,
  abortSignal,
}: {
  tools: ToolSet;
  name: string;
  arguments: Record<string, unknown>;
  callId?: string;
  abortSignal?: AbortSignal;
}): Promise<
  { success: true; result: unknown } | { success: false; error: string }
> {
  const tool = tools[name];

  if (tool == null) {
    return { success: false, error: `Tool not found: ${name}` };
  }

  if (!isExecutableTool(tool)) {
    return {
      success: false,
      error: `Tool "${name}" has no execute function`,
    };
  }

  const schema = asSchema(tool.inputSchema);

  let validatedArgs: unknown = args;
  if (schema.validate != null) {
    const validationResult = await schema.validate(args);
    if (!validationResult.success) {
      return {
        success: false,
        error: `Invalid arguments for tool "${name}": ${validationResult.error.message}`,
      };
    }
    validatedArgs = validationResult.value;
  }

  try {
    const stream = executeTool({
      tool,
      input: validatedArgs,
      options: {
        toolCallId: callId ?? `realtime-${name}-${Date.now()}`,
        messages: [],
        abortSignal,
        context: undefined as never,
      },
    });

    let finalOutput: unknown;
    for await (const part of stream) {
      finalOutput = part.output;
    }

    return { success: true, result: finalOutput };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
