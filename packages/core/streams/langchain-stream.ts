import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';
import { BaseCallbackHandler } from 'langchain/callbacks';

const FUNCTION_NAME_PREFIX = '{"function_call":{"name": "';
const FUNCTION_NAME_SUFFIX = '"';
const FUNCTION_ARGUMENTS_PREFIX = ', "arguments": ';
const FUNCTION_ARGUMENTS_SUFFIX = '}}';

export function LangChainStream(callbacks?: AIStreamCallbacksAndOptions): {
  stream: ReadableStream;
  writer: WritableStreamDefaultWriter;
  handlers: BaseCallbackHandler;
} {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const runs = new Set();
  const runState = new Map<string, 'function' | 'arguments' | 'text'>();

  const handleError = async (e: Error, runId: string) => {
    runs.delete(runId);
    await writer.ready;
    await writer.abort(e);
  };

  const handleStart = async (runId: string) => {
    runs.add(runId);
  };

  const handleEnd = async (runId: string) => {
    runs.delete(runId);

    if (runs.size === 0) {
      await writer.ready;
      await writer.close();
    }
  };

  return {
    stream: stream.readable
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(
        createStreamDataTransformer(callbacks?.experimental_streamData),
      ),
    writer,
    handlers: BaseCallbackHandler.fromMethods({
      handleLLMNewToken: async (
        token,
        _idx,
        runId,
        _parentRunId,
        _tags,
        fields,
      ) => {
        let text = '';

        const chunk = fields?.chunk;
        if (!!chunk) {
          if (chunk.text) {
            text += chunk.text;
            runState.set(runId, 'text');
          }

          if ('message' in chunk) {
            const fn = chunk.message.additional_kwargs.function_call;
            if (fn?.name) {
              if (runState.get(runId) !== 'function') {
                text += FUNCTION_NAME_PREFIX;
                runState.set(runId, 'function');
              }

              text += fn.name;
            } else if (runState.get(runId) === 'function') {
              text += FUNCTION_NAME_SUFFIX;
            }

            if (fn?.arguments) {
              if (runState.get(runId) !== 'arguments') {
                text += FUNCTION_ARGUMENTS_PREFIX;
                runState.set(runId, 'arguments');
              }

              text += fn.arguments;
            } else {
              if (runState.get(runId) === 'arguments') {
                text += FUNCTION_ARGUMENTS_SUFFIX;
              }
            }
          }
        } else {
          text = token;
        }

        if (!!text) {
          await writer.ready;
          await writer.write(text);
        }
      },
      handleLLMStart: async (_llm: any, _prompts: string[], runId: string) => {
        handleStart(runId);
      },
      handleLLMEnd: async (_output: any, runId: string) => {
        await handleEnd(runId);
      },
      handleLLMError: async (e: Error, runId: string) => {
        await handleError(e, runId);
      },
      handleChainStart: async (_chain: any, _inputs: any, runId: string) => {
        handleStart(runId);
      },
      handleChainEnd: async (_outputs: any, runId: string) => {
        await handleEnd(runId);
      },
      handleChainError: async (e: Error, runId: string) => {
        await handleError(e, runId);
      },
      handleToolStart: async (_tool: any, _input: string, runId: string) => {
        handleStart(runId);
      },
      handleToolEnd: async (_output: string, runId: string) => {
        await handleEnd(runId);
      },
      handleToolError: async (e: Error, runId: string) => {
        await handleError(e, runId);
      },
    }),
  };
}
