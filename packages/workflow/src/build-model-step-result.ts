import type { LanguageModelV4Content } from '@ai-sdk/provider';
import {
  convertLanguageModelContent,
  DefaultStepResult,
  calculateTokensPerSecond,
} from 'ai/internal';
import type { Context } from '@ai-sdk/provider-utils';
import {
  DefaultGeneratedFile,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import type {
  ModelCallRawResult,
  ModelCallFinish,
  ParsedToolCall,
  ProviderExecutedToolResult,
} from './model-call.js';

export function buildModelStepResult(
  raw: ModelCallRawResult,
  toolCalls: ParsedToolCall[],
  finish: ModelCallFinish | undefined,
  providerExecutedToolResults: Map<string, ProviderExecutedToolResult>,
  opts: {
    tools?: ToolSet;
    requestMessages?: ModelMessage[];
    stepNumber: number;
    runtimeContext: Context;
    toolsContext: Record<string, Context | undefined>;
  },
): StepResult<ToolSet, any> {
  if (raw.generation != null && finish != null) {
    const providerContent: LanguageModelV4Content[] = raw.content.map(part => {
      switch (part.type) {
        case 'tool-call': {
          const call = toolCalls[part.toolCallIndex];
          return { ...call, input: '', type: 'tool-call' };
        }
        case 'provider-tool-result':
          return {
            ...providerExecutedToolResults.get(part.toolCallId)!,
            type: 'tool-result',
          } as Extract<LanguageModelV4Content, { type: 'tool-result' }>;
        case 'file':
          return { ...part, data: { type: 'data', data: part.data } };
        default:
          return part;
      }
    });
    const content = convertLanguageModelContent({
      content: providerContent,
      toolCalls: toolCalls as StepResult<ToolSet>['toolCalls'],
      toolOutputs: [],
      toolApprovalRequests: [],
      toolApprovalResponses: [],
      tools: opts.tools,
    });
    const duration = raw.generation.responseTimeMs;
    const rate = (tokens: number | undefined) =>
      calculateTokensPerSecond({ tokens, durationMs: duration });
    return new DefaultStepResult({
      callId: 'workflow-agent',
      stepNumber: opts.stepNumber,
      provider: raw.generation.provider,
      modelId: raw.generation.modelId,
      runtimeContext: opts.runtimeContext,
      toolsContext: opts.toolsContext,
      content,
      finishReason: finish.finishReason,
      rawFinishReason: finish.rawFinishReason,
      usage: finish.usage,
      warnings: raw.warnings as StepResult<ToolSet>['warnings'],
      request: { ...raw.generation.request, messages: opts.requestMessages },
      response: {
        ...raw.responseMetadata,
        messages: [],
      } as StepResult<ToolSet>['response'],
      providerMetadata:
        finish.providerMetadata as StepResult<ToolSet>['providerMetadata'],
      performance: {
        responseTimeMs: duration,
        stepTimeMs: duration,
        toolExecutionMs: {},
        effectiveOutputTokensPerSecond: rate(finish.usage.outputTokens),
        effectiveTotalTokensPerSecond: rate(finish.usage.totalTokens),
        outputTokensPerSecond: undefined,
        inputTokensPerSecond: undefined,
        timeToFirstOutputMs: undefined,
      },
    });
  }
  const {
    content: rawContent,
    reasoning: reasoningParts,
    responseMetadata,
    warnings,
  } = raw;
  const reasoningText = reasoningParts.map(r => r.text).join('') || undefined;
  const validToolCallsByIndex = new Map(
    toolCalls.flatMap((tc, index) =>
      tc.invalid
        ? []
        : [
            [
              index,
              {
                type: 'tool-call' as const,
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
                ...(tc.providerExecuted != null
                  ? { providerExecuted: tc.providerExecuted }
                  : {}),
                ...(tc.title != null ? { title: tc.title } : {}),
                ...(tc.toolMetadata != null
                  ? { toolMetadata: tc.toolMetadata }
                  : {}),
                ...(tc.dynamic ? { dynamic: true as const } : {}),
                ...(tc.providerExecuted ? { providerExecuted: true } : {}),
                ...(tc.providerMetadata != null
                  ? { providerMetadata: tc.providerMetadata }
                  : {}),
              },
            ] as const,
          ],
    ),
  );
  const validToolCalls = [...validToolCallsByIndex.values()];
  const content: StepResult<ToolSet, any>['content'] = [];
  const files: StepResult<ToolSet, any>['files'] = [];
  const sources: StepResult<ToolSet, any>['sources'] = [];
  let text = '';

  for (const part of rawContent) {
    switch (part.type) {
      case 'text':
        text += part.text;
        content.push({
          type: 'text',
          text: part.text,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        break;
      case 'file': {
        const file = new DefaultGeneratedFile({
          data: part.data,
          mediaType: part.mediaType,
          providerMetadata: part.providerMetadata,
        });
        files.push(file);
        content.push({
          type: 'file',
          file,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        });
        break;
      }
      case 'source':
        sources.push(part);
        content.push(part);
        break;
      case 'tool-call': {
        const toolCall = validToolCallsByIndex.get(part.toolCallIndex);
        if (toolCall != null) {
          content.push(toolCall);
        }
        break;
      }
      case 'provider-tool-result': {
        const result = providerExecutedToolResults.get(part.toolCallId);
        if (result == null) {
          break;
        }

        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === result.toolCallId,
        );
        const common = {
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          input: toolCall?.input,
          providerExecuted: true as const,
          ...(result.dynamic === true || toolCall?.dynamic === true
            ? { dynamic: true as const }
            : {}),
          ...(result.providerMetadata != null
            ? { providerMetadata: result.providerMetadata }
            : {}),
          ...(toolCall?.toolMetadata != null
            ? { toolMetadata: toolCall.toolMetadata }
            : {}),
        };

        content.push(
          result.isError
            ? {
                type: 'tool-error',
                ...common,
                error: result.result,
              }
            : {
                type: 'tool-result',
                ...common,
                output: result.result,
              },
        );
        break;
      }
    }
  }

  const toolResults = content.filter(
    part => part.type === 'tool-result',
  ) as StepResult<ToolSet, any>['toolResults'];

  return {
    callId: 'workflow-agent',
    stepNumber: opts.stepNumber,
    model: {
      provider: responseMetadata?.modelId?.split(':')[0] ?? 'unknown',
      modelId: responseMetadata?.modelId ?? 'unknown',
    },
    functionId: undefined,
    metadata: undefined,
    runtimeContext: opts.runtimeContext ?? {},
    toolsContext: opts.toolsContext ?? {},
    content,
    text,
    reasoning: reasoningParts.map(r => ({
      type: 'reasoning' as const,
      text: r.text,
    })),
    reasoningText,
    files,
    sources,
    toolCalls: validToolCalls,
    staticToolCalls: validToolCalls.filter(tc => tc.dynamic !== true),
    dynamicToolCalls: validToolCalls.filter(tc => tc.dynamic),
    toolResults,
    staticToolResults: toolResults.filter(result => result.dynamic !== true),
    dynamicToolResults: toolResults.filter(result => result.dynamic === true),
    finishReason: finish?.finishReason ?? 'other',
    rawFinishReason: finish?.rawFinishReason,
    usage:
      finish?.usage ??
      ({
        inputTokens: 0,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 0,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: 0,
      } as LanguageModelUsage),
    performance: {
      effectiveOutputTokensPerSecond: 0,
      outputTokensPerSecond: undefined,
      inputTokensPerSecond: undefined,
      effectiveTotalTokensPerSecond: 0,
      stepTimeMs: 0,
      responseTimeMs: 0,
      toolExecutionMs: {},
      timeToFirstOutputMs: undefined,
    },
    warnings,
    request: {
      body: '',
      messages: [], // TODO implement step request messages
    },
    response: {
      id: responseMetadata?.id ?? 'unknown',
      timestamp: responseMetadata?.timestamp ?? new Date(),
      modelId: responseMetadata?.modelId ?? 'unknown',
      messages: [],
    },
    providerMetadata: finish?.providerMetadata ?? {},
  } as StepResult<ToolSet, any>;
}
