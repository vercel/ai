import { nanoid } from 'nanoid';
import { z } from 'zod';
import { safeParseJSON } from '../../schema/parse-json';
import { ZodSchema } from '../../schema/zod-schema';
import { ErrorStreamPart, LanguageModelStreamPart } from '../language-model';
import { Tool } from '../tool';
import { ToolResultStreamPart } from './tool-result-stream-part';

type ReturnStreamPart<
  TOOLS extends {
    [name: string]: z.Schema;
  } = {},
> =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | {
      // TODO more precise tool call stream parts
      type: 'tool-call';
      toolCallId: keyof TOOLS & string;
      toolName: string;
      args: z.infer<TOOLS[keyof TOOLS]>;
    }
  | {
      type: 'error';
      error: unknown;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      result: unknown;
    };

export function runToolsTransformation<
  TOOLS extends {
    [name: string]: z.Schema;
  } = {},
>({
  tools,
  generatorStream,
}: {
  tools?: {
    [name in keyof TOOLS]: Tool<TOOLS[name], unknown>;
  };
  generatorStream: ReadableStream<LanguageModelStreamPart>;
}): ReadableStream<ReturnStreamPart<TOOLS>> {
  let canClose = false;
  const outstandingToolCalls = new Set<string>();

  // tool results stream
  let toolResultsStreamController: ReadableStreamDefaultController<
    ToolResultStreamPart | ErrorStreamPart
  > | null = null;
  const toolResultsStream = new ReadableStream<
    ToolResultStreamPart | ErrorStreamPart
  >({
    start(controller) {
      toolResultsStreamController = controller;
    },
  });

  // forward stream
  const forwardStream = new TransformStream<
    LanguageModelStreamPart,
    ReturnStreamPart<TOOLS>
  >({
    transform(
      chunk: LanguageModelStreamPart,
      controller: TransformStreamDefaultController<
        LanguageModelStreamPart | ToolResultStreamPart
      >,
    ) {
      const chunkType = chunk.type;

      switch (chunkType) {
        // forward:
        case 'text-delta':
        case 'error': {
          controller.enqueue(chunk);
          break;
        }

        // process
        case 'tool-call': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          if (tools == null) {
            // TODO add dedicated error to list of errors (NoSuchToolError)
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: `Tool ${chunk.toolName} not found (no tools provided)`,
            });
            break;
          }

          const tool = tools[toolName];

          if (tool == null) {
            // TODO add dedicated error to list of errors (NoSuchToolError)
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: `Tool ${chunk.toolName} not found`,
            });

            break;
          }

          const parseResult = safeParseJSON({
            text: chunk.args,
            schema: new ZodSchema(tool.parameters),
          });

          if (parseResult.success === false) {
            // TODO dedicate tool call error (InvalidToolArgumentsError)
            toolResultsStreamController!.enqueue({
              type: 'error',
              error: `Tool call ${toolName} has invalid arguments: ${parseResult.error}`,
            });

            break;
          }

          // TODO should have typesafe tool call arguments
          const toolArgs = parseResult.value;

          controller.enqueue({
            type: 'tool-call',
            toolCallId: chunk.toolCallId,
            toolName,
            args: toolArgs,
          });

          if (tool.execute != null) {
            const toolExecutionId = nanoid(); // use our own id to guarantee uniqueness
            outstandingToolCalls.add(toolExecutionId);

            // TODO full tool call args parsing & validation
            const argsp = JSON.parse(chunk.args);
            const execute = tool.execute as any;
            execute(argsp).then(
              (result: any) => {
                toolResultsStreamController!.enqueue({
                  type: 'tool-result',
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  result,
                });

                outstandingToolCalls.delete(toolExecutionId);

                // close the tool results controller if no more outstanding tool calls
                if (canClose && outstandingToolCalls.size === 0) {
                  toolResultsStreamController!.close();
                }
              },
              (error: any) => {
                toolResultsStreamController!.enqueue({
                  type: 'error',
                  error,
                });

                outstandingToolCalls.delete(toolExecutionId);

                // close the tool results controller if no more outstanding tool calls
                if (canClose && outstandingToolCalls.size === 0) {
                  toolResultsStreamController!.close();
                }
              },
            );
          }

          break;
        }

        // ignore
        case 'tool-call-delta': {
          break;
        }

        default: {
          const _exhaustiveCheck: never = chunkType;
          throw new Error(`Unhandled chunk type: ${_exhaustiveCheck}`);
        }
      }
    },

    flush() {
      canClose = true;

      if (outstandingToolCalls.size === 0) {
        toolResultsStreamController!.close();
      }
    },
  });

  // combine the generator stream and the tool results stream
  return new ReadableStream<ReturnStreamPart<TOOLS>>({
    async start(controller) {
      generatorStream.pipeThrough(forwardStream).pipeTo(
        new WritableStream({
          write(chunk) {
            controller.enqueue(chunk);
          },
          close() {
            // the generator stream controller is automatically closed when it's consumed
          },
        }),
      );

      toolResultsStream.pipeTo(
        new WritableStream({
          write(chunk) {
            controller.enqueue(chunk);
          },
          close() {
            controller.close();
          },
        }),
      );
    },
  });
}
