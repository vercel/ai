import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { generateId, convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  ToolChoiceViolationError,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import {
  asLanguageModelUsage,
  parseToolCall,
  prepareLanguageModelCallOptions,
  prepareRetries,
  prepareToolChoice,
  prepareTools,
  resolveLanguageModel,
} from 'ai/internal';
import type {
  ModelCallOptions,
  ModelCallRawContentPart,
  ModelCallResult,
  ProviderExecutedToolResult,
  ToolInputLifecycleEvent,
} from './model-call.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

/** A single durable provider call; orchestration and callbacks stay in the workflow. */
export async function doGenerateStep(
  prompt: LanguageModelV4Prompt,
  modelInit: LanguageModel,
  serializedTools: Record<string, SerializableToolDef>,
  options: ModelCallOptions = {},
): Promise<ModelCallResult> {
  'use step';

  try {
    return await generateModelCall(prompt, modelInit, serializedTools, options);
  } catch (error) {
    // Carry failures as data so Workflow does not normalize arbitrary thrown
    // values (including undefined) before the agent rejects in workflow code.
    return {
      toolCalls: [],
      finish: undefined,
      raw: { content: [], reasoning: [] },
      providerExecutedToolResults: new Map(),
      terminalError: error,
    };
  }
}

async function generateModelCall(
  prompt: LanguageModelV4Prompt,
  modelInit: LanguageModel,
  serializedTools: Record<string, SerializableToolDef>,
  options: ModelCallOptions,
): Promise<ModelCallResult> {
  const remaining =
    options.timeoutAt == null ? undefined : options.timeoutAt - Date.now();
  options.abortSignal?.throwIfAborted();
  if (remaining != null && remaining <= 0) {
    throw new DOMException('The generation deadline expired.', 'TimeoutError');
  }
  const abortSignal =
    remaining == null
      ? options.abortSignal
      : AbortSignal.any([
          ...(options.abortSignal == null ? [] : [options.abortSignal]),
          AbortSignal.timeout(remaining),
        ]);
  const model = resolveLanguageModel(modelInit);
  const tools = resolveSerializableTools(serializedTools);
  const toolChoice = prepareToolChoice({ toolChoice: options.toolChoice });
  const modelTools = await prepareTools({ tools });
  const settings = prepareLanguageModelCallOptions(options);
  const { retry } = prepareRetries({
    maxRetries: options.maxRetries,
    abortSignal,
  });
  const start = Date.now();
  const response = await retry(async () => {
    abortSignal?.throwIfAborted();
    if (options.timeoutAt != null && options.timeoutAt <= Date.now())
      throw new DOMException(
        'The generation deadline expired.',
        'TimeoutError',
      );
    return model.doGenerate({
      ...settings,
      prompt: [...prompt],
      tools: modelTools,
      toolChoice,
      responseFormat: options.responseFormat,
      providerOptions: options.providerOptions,
      headers: options.headers,
      abortSignal,
    });
  });
  abortSignal?.throwIfAborted();
  const responseTimeMs = Date.now() - start;
  const toolCalls = await Promise.all(
    response.content
      .filter(part => part.type === 'tool-call')
      .map(toolCall =>
        parseToolCall({
          toolCall,
          tools,
          repairToolCall: options.repairToolCall,
          instructions:
            prompt
              .filter(message => message.role === 'system')
              .map(message => message.content)
              .join('\n') || undefined,
          messages: prompt.filter(
            message => message.role !== 'system',
          ) as unknown as ModelMessage[],
        }),
      ),
  );
  if (
    (toolChoice.type === 'required' || toolChoice.type === 'tool') &&
    !toolCalls.some(
      call =>
        toolChoice.type === 'required' || call.toolName === toolChoice.toolName,
    )
  ) {
    throw new ToolChoiceViolationError({
      toolChoice,
      finishReason: response.finishReason.unified,
      provider: model.provider,
      modelId: model.modelId,
      content: response.content,
    });
  }
  const providerExecutedToolResults = new Map<
    string,
    ProviderExecutedToolResult
  >();
  const content: ModelCallRawContentPart[] = response.content.map(part => {
    switch (part.type) {
      case 'tool-call':
        return {
          type: 'tool-call',
          toolCallIndex: toolCalls.findIndex(
            call => call.toolCallId === part.toolCallId,
          ),
        };
      case 'tool-result':
        providerExecutedToolResults.set(part.toolCallId, part);
        return { type: 'provider-tool-result', toolCallId: part.toolCallId };
      case 'file':
        return {
          type: 'file',
          data:
            part.data.type === 'data'
              ? typeof part.data.data === 'string'
                ? part.data.data
                : convertUint8ArrayToBase64(part.data.data)
              : part.data.url.toString(),
          mediaType: part.mediaType,
          providerMetadata: part.providerMetadata,
        };
      default:
        return part;
    }
  });
  const toolInputLifecycleEvents: ToolInputLifecycleEvent[] = toolCalls.flatMap(
    call => {
      const tool = serializedTools[call.toolName];
      if (call.invalid || tool == null) return [];
      const events: ToolInputLifecycleEvent[] = [];
      if (tool.hasOnInputStart || tool.hasOnInputAvailable)
        events.push(['start', call.toolCallId, call.toolName]);
      if (tool.hasOnInputAvailable) events.push(['available', call.toolCallId]);
      return events;
    },
  );
  return {
    toolCalls,
    finish: {
      finishReason: response.finishReason.unified,
      rawFinishReason: response.finishReason.raw,
      usage: asLanguageModelUsage(response.usage),
      providerMetadata: response.providerMetadata,
    },
    raw: {
      content,
      reasoning: [],
      warnings: response.warnings,
      responseMetadata: {
        id: response.response?.id ?? generateId(),
        timestamp: response.response?.timestamp ?? new Date(),
        modelId: response.response?.modelId ?? model.modelId,
        headers: response.response?.headers,
        ...(options.include?.responseBody
          ? { body: response.response?.body }
          : {}),
      },
      generation: {
        provider: model.provider,
        modelId: model.modelId,
        responseTimeMs,
        request: options.include?.requestBody ? response.request : undefined,
      },
    },
    providerExecutedToolResults,
    toolInputLifecycleEvents,
  };
}

doGenerateStep.maxRetries = 0;
