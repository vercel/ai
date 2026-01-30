import { executeTool, ModelMessage } from '@ai-sdk/provider-utils';
import { Tracer } from '@opentelemetry/api';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { recordErrorOnSpan, recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { TypedToolCall } from './tool-call';
import { ToolOutput } from './tool-output';
import { ToolSet } from './tool-set';
import { TypedToolResult } from './tool-result';
import { TypedToolError } from './tool-error';
import { ToolErrorHandler } from './tool-error-handler';

export async function executeToolCall<TOOLS extends ToolSet>({
  toolCall,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
  experimental_context,
  experimental_toolErrorHandler,
  onPreliminaryToolResult,
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  messages: ModelMessage[];
  abortSignal: AbortSignal | undefined;
  experimental_context: unknown;
  experimental_toolErrorHandler?: ToolErrorHandler<TOOLS>;
  onPreliminaryToolResult?: (result: TypedToolResult<TOOLS>) => void;
}): Promise<ToolOutput<TOOLS> | undefined> {
  const { toolName, toolCallId, input } = toolCall;
  const tool = tools?.[toolName];

  if (tool?.execute == null) {
    return undefined;
  }

  return recordSpan({
    name: 'ai.toolCall',
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: 'ai.toolCall',
          telemetry,
        }),
        'ai.toolCall.name': toolName,
        'ai.toolCall.id': toolCallId,
        'ai.toolCall.args': {
          output: () => JSON.stringify(input),
        },
      },
    }),
    tracer,
    fn: async span => {
      let output: unknown;

      try {
        const stream = executeTool({
          execute: tool.execute!.bind(tool),
          input,
          options: {
            toolCallId,
            messages,
            abortSignal,
            experimental_context,
          },
        });

        for await (const part of stream) {
          if (part.type === 'preliminary') {
            onPreliminaryToolResult?.({
              ...toolCall,
              type: 'tool-result',
              output: part.output,
              preliminary: true,
            });
          } else {
            output = part.output;
          }
        }
      } catch (error) {
        recordErrorOnSpan(span, error);

        // Check if we should send error to LLM
        const handler = experimental_toolErrorHandler;
        const action = handler
          ? await handler({ toolCallId, toolName, input, error, messages })
          : 'retry';

        if (action === 'send-to-llm') {
          // Convert to tool-result (sent to LLM)
          return {
            type: 'tool-result',
            toolCallId,
            toolName,
            input,
            output: {
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            },
            dynamic: tool.type === 'dynamic',
            ...(toolCall.providerMetadata != null
              ? { providerMetadata: toolCall.providerMetadata }
              : {}),
          } as TypedToolResult<TOOLS>;
        }

        // Default: return tool-error (stops execution)
        return {
          type: 'tool-error',
          toolCallId,
          toolName,
          input,
          error,
          dynamic: tool.type === 'dynamic',
          ...(toolCall.providerMetadata != null
            ? { providerMetadata: toolCall.providerMetadata }
            : {}),
        } as TypedToolError<TOOLS>;
      }

      try {
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.toolCall.result': {
                output: () => JSON.stringify(output),
              },
            },
          }),
        );
      } catch (ignored) {
        // JSON stringify might fail if the result is not serializable,
        // in which case we just ignore it. In the future we might want to
        // add an optional serialize method to the tool interface and warn
        // if the result is not serializable.
      }

      return {
        type: 'tool-result',
        toolCallId,
        toolName,
        input,
        output,
        dynamic: tool.type === 'dynamic',
        ...(toolCall.providerMetadata != null
          ? { providerMetadata: toolCall.providerMetadata }
          : {}),
      } as TypedToolResult<TOOLS>;
    },
  });
}
