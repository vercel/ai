import { asSchema, executeTool } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Executes a tool call received from the realtime model. Looks up the
 * tool by name, validates the arguments, and runs the execute function.
 *
 * Use this in the POST handler of your tools endpoint.
 *
 * @example
 * ```ts
 * import { executeRealtimeTool } from 'ai';
 *
 * export async function POST(request: Request) {
 *   const { name, arguments: args, callId } = await request.json();
 *   const result = await executeRealtimeTool({
 *     tools, name, arguments: args, callId,
 *   });
 *   return Response.json(result);
 * }
 * ```
 */
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

  if (tool.execute == null) {
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
      execute: tool.execute.bind(tool),
      input: validatedArgs,
      options: {
        toolCallId: callId ?? `realtime-${name}-${Date.now()}`,
        messages: [],
        abortSignal,
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
