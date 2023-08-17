import {
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer
} from './ai-stream'
import { createStreamDataTransformer } from './stream-data'

export function LangChainStream(callbacks?: AIStreamCallbacksAndOptions) {
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const runs = new Set()

  const handleError = async (e: Error, runId: string) => {
    runs.delete(runId)
    await writer.ready
    await writer.abort(e)
  }

  const handleStart = async (runId: string) => {
    runs.add(runId)
  }

  const handleEnd = async (runId: string) => {
    runs.delete(runId)

    if (runs.size === 0) {
      await writer.ready
      await writer.close()
    }
  }

  return {
    stream: stream.readable
      .pipeThrough(createCallbacksTransformer(callbacks))
      .pipeThrough(
        createStreamDataTransformer(callbacks?.experimental_streamData)
      ),
    handlers: {
      handleLLMNewToken: async (token: string) => {
        await writer.ready
        await writer.write(token)
      },
      handleLLMStart: async (_llm: any, _prompts: string[], runId: string) => {
        handleStart(runId)
      },
      handleLLMEnd: async (_output: any, runId: string) => {
        await handleEnd(runId)
      },
      handleLLMError: async (e: Error, runId: string) => {
        await handleError(e, runId)
      },
      handleChainStart: async (_chain: any, _inputs: any, runId: string) => {
        handleStart(runId)
      },
      handleChainEnd: async (_outputs: any, runId: string) => {
        await handleEnd(runId)
      },
      handleChainError: async (e: Error, runId: string) => {
        await handleError(e, runId)
      },
      handleToolStart: async (_tool: any, _input: string, runId: string) => {
        handleStart(runId)
      },
      handleToolEnd: async (_output: string, runId: string) => {
        await handleEnd(runId)
      },
      handleToolError: async (e: Error, runId: string) => {
        await handleError(e, runId)
      }
    }
  }
}
