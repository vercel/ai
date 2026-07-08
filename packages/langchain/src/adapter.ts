import {
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StateSnapshot } from '@langchain/langgraph';
import { secureJsonParse } from '@ai-sdk/provider-utils';
import {
  convertToModelMessages,
  type JSONValue,
  type UIMessage,
  type UIMessageChunk,
  type ModelMessage,
  type ProviderMetadata,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from 'ai';
import {
  convertToolResultPart,
  convertAssistantContent,
  convertUserContent,
  processModelChunk,
  processLangGraphEvent,
  parseLangGraphEvent,
  isToolResultPart,
  extractReasoningFromContentBlocks,
  extractCitationsFromContentBlocks,
  emitSourceChunks,
  extractReasoningFromValuesMessage,
  getMessageId,
  extractImageOutputs,
} from './utils';
import type { LangGraphEventState, NormalizedCitation } from './types';
import type { StreamCallbacks } from './stream-callbacks';

type AnyUIMessage = UIMessage<unknown, UIDataTypes, UITools>;
type AnyUIMessagePart = UIMessagePart<UIDataTypes, UITools>;

type LangChainToolCall = {
  id?: string;
  name?: string;
  args?: unknown;
};

type InterruptActionRequest = {
  id?: string;
  name: string;
  input: unknown;
};

function getMessageData(message: unknown): Record<string, unknown> {
  if (message == null || typeof message !== 'object') {
    return {};
  }

  const record = message as Record<string, unknown>;
  if (
    record.type === 'constructor' &&
    record.kwargs != null &&
    typeof record.kwargs === 'object'
  ) {
    return record.kwargs as Record<string, unknown>;
  }

  return record;
}

function normalizeChatRole(role: unknown): string | undefined {
  switch (role) {
    case 'system':
      return 'system';
    case 'human':
    case 'user':
      return 'human';
    case 'ai':
    case 'assistant':
      return 'ai';
    case 'tool':
      return 'tool';
    default:
      return undefined;
  }
}

function normalizeMessageType(
  type: unknown,
  data: Record<string, unknown>,
): string | undefined {
  switch (type) {
    case 'system':
    case 'SystemMessage':
    case 'SystemMessageChunk':
      return 'system';
    case 'human':
    case 'user':
    case 'HumanMessage':
    case 'HumanMessageChunk':
      return 'human';
    case 'ai':
    case 'assistant':
    case 'AIMessage':
    case 'AIMessageChunk':
      return 'ai';
    case 'tool':
    case 'ToolMessage':
    case 'ToolMessageChunk':
      return 'tool';
    case 'function':
    case 'FunctionMessage':
    case 'FunctionMessageChunk':
      return 'function';
    case 'generic':
    case 'ChatMessage':
    case 'ChatMessageChunk':
      return normalizeChatRole(data.role) ?? 'human';
    default:
      return typeof type === 'string' ? type : undefined;
  }
}

function getMessageType(message: unknown): string | undefined {
  const data = getMessageData(message);

  if (message != null && typeof message === 'object') {
    const typedMessage = message as { _getType?: () => string };
    if (typeof typedMessage._getType === 'function') {
      return normalizeMessageType(typedMessage._getType(), data);
    }
  }

  const record = message as Record<string, unknown> | undefined;
  if (record?.type === 'constructor' && Array.isArray(record.id)) {
    const constructorId = record.id as string[];
    if (constructorId.includes('SystemMessage')) return 'system';
    if (constructorId.includes('HumanMessage')) return 'human';
    if (
      constructorId.includes('AIMessage') ||
      constructorId.includes('AIMessageChunk')
    ) {
      return 'ai';
    }
    if (constructorId.includes('ToolMessage')) return 'tool';
    if (constructorId.includes('FunctionMessage')) return 'function';
    if (constructorId.includes('ChatMessage')) {
      return normalizeChatRole(data.role) ?? 'human';
    }
  }

  return normalizeMessageType(record?.type, data);
}

function createMessageId(message: unknown, index: number): string {
  return getMessageId(message) ?? `langchain-message-${index}`;
}

function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let counter = 1;

  while (usedIds.has(id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  usedIds.add(id);
  return id;
}

function createUniqueMessageId(
  message: unknown,
  index: number,
  usedIds: Set<string>,
): string {
  return makeUniqueId(createMessageId(message, index), usedIds);
}

function parseToolInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input ?? {};
  }

  try {
    return secureJsonParse(input);
  } catch {
    return input;
  }
}

function normalizeToolInput(input: unknown): unknown {
  return parseToolInput(input);
}

function normalizeForStableStringify(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForStableStringify);
  }

  if (value != null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [
          key,
          normalizeForStableStringify(entryValue),
        ]),
    );
  }

  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

function getToolRequestKey(toolName: string, input: unknown): string {
  return `${toolName}:${stableStringify(normalizeToolInput(input))}`;
}

function getInterruptActionRequestKey(request: InterruptActionRequest): string {
  return request.id == null
    ? `tool:${getToolRequestKey(request.name, request.input)}`
    : `id:${request.id}`;
}

function getSyntheticToolCallId(
  message: unknown,
  messageIndex: number,
  toolCallIndex: number,
): string {
  return `call_${getMessageId(message) ?? messageIndex}_${toolCallIndex}`;
}

function getToolCalls(
  message: unknown,
  messageIndex: number,
): LangChainToolCall[] {
  if (AIMessage.isInstance(message) || AIMessageChunk.isInstance(message)) {
    return (message.tool_calls ?? []).map((toolCall, index) => ({
      id: toolCall.id ?? getSyntheticToolCallId(message, messageIndex, index),
      name: toolCall.name ?? 'unknown',
      args: normalizeToolInput(toolCall.args),
    }));
  }

  const data = getMessageData(message);
  if (Array.isArray(data.tool_calls)) {
    return (data.tool_calls as LangChainToolCall[]).map((toolCall, index) => ({
      ...toolCall,
      id: toolCall.id ?? getSyntheticToolCallId(message, messageIndex, index),
      name: toolCall.name ?? 'unknown',
      args: normalizeToolInput(toolCall.args),
    }));
  }

  const additionalKwargs = data.additional_kwargs;
  if (
    additionalKwargs != null &&
    typeof additionalKwargs === 'object' &&
    Array.isArray((additionalKwargs as { tool_calls?: unknown }).tool_calls)
  ) {
    return (
      (
        additionalKwargs as {
          tool_calls: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        }
      ).tool_calls ?? []
    ).map((toolCall, index) => ({
      id: toolCall.id ?? getSyntheticToolCallId(message, messageIndex, index),
      name: toolCall.function?.name ?? 'unknown',
      args: normalizeToolInput(toolCall.function?.arguments),
    }));
  }

  return [];
}

function getTextPartsFromContent(
  content: unknown,
  { includeFiles = true }: { includeFiles?: boolean } = {},
): AnyUIMessagePart[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  const parts: AnyUIMessagePart[] = [];

  for (const block of content) {
    if (block == null || typeof block !== 'object') continue;
    const blockRecord = block as Record<string, unknown>;

    if (blockRecord.type === 'text' && typeof blockRecord.text === 'string') {
      parts.push({ type: 'text', text: blockRecord.text });
      continue;
    }

    if (
      blockRecord.type === 'image_url' &&
      blockRecord.image_url != null &&
      typeof blockRecord.image_url === 'object'
    ) {
      if (!includeFiles) continue;

      const imageUrl = blockRecord.image_url as { url?: unknown };
      if (typeof imageUrl.url === 'string') {
        parts.push({
          type: 'file',
          mediaType: getImageMediaType(imageUrl.url),
          url: imageUrl.url,
        });
      }
      continue;
    }

    if (blockRecord.type === 'file') {
      if (!includeFiles) continue;

      const mediaType =
        typeof blockRecord.mimeType === 'string'
          ? blockRecord.mimeType
          : typeof blockRecord.mediaType === 'string'
            ? blockRecord.mediaType
            : 'application/octet-stream';
      const filename =
        typeof blockRecord.filename === 'string'
          ? blockRecord.filename
          : undefined;

      if (typeof blockRecord.url === 'string') {
        parts.push({
          type: 'file',
          mediaType,
          filename,
          url: blockRecord.url,
        });
      } else if (typeof blockRecord.data === 'string') {
        parts.push({
          type: 'file',
          mediaType,
          filename,
          url: blockRecord.data.startsWith('data:')
            ? blockRecord.data
            : `data:${mediaType};base64,${blockRecord.data}`,
        });
      }
    }
  }

  return parts;
}

function getImageMediaType(url: string): string {
  const dataUrlMatch = /^data:([^;,]+)[;,]/.exec(url);
  if (dataUrlMatch?.[1]?.startsWith('image/')) {
    return dataUrlMatch[1];
  }

  try {
    const extension = new URL(url).pathname.toLowerCase().split('.').pop();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'png':
        return 'image/png';
    }
  } catch {
    // Fall back to PNG below for non-URL strings.
  }

  return 'image/png';
}

function createUIPartsFromMessageContent(
  message: unknown,
  options?: { includeFiles?: boolean },
): AnyUIMessagePart[] {
  const data = getMessageData(message);
  return getTextPartsFromContent(data.content, options);
}

function ensureNonEmptyParts(parts: AnyUIMessagePart[]): AnyUIMessagePart[] {
  return parts.length > 0 ? parts : [{ type: 'text', text: '' }];
}

function getToolOutput(message: unknown): {
  output: unknown;
  errorText?: string;
} {
  const data = getMessageData(message);
  const content = data.content;
  const output = (() => {
    if ('artifact' in data && data.artifact !== undefined) {
      return data.artifact;
    }

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const textBlocks = content.filter(
        (block): block is { type: 'text'; text: string } =>
          block != null &&
          typeof block === 'object' &&
          (block as { type?: unknown }).type === 'text' &&
          typeof (block as { text?: unknown }).text === 'string',
      );

      return textBlocks.length === content.length
        ? textBlocks.map(block => block.text).join('')
        : content;
    }

    return content;
  })();

  if (data.status === 'error') {
    return {
      output,
      errorText: typeof output === 'string' ? output : 'Tool execution failed',
    };
  }

  return { output };
}

function getToolCallId(message: unknown): string | undefined {
  if (ToolMessage.isInstance(message)) {
    return message.tool_call_id;
  }

  const data = getMessageData(message);
  return typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
}

function addAssistantReasoningParts(
  message: unknown,
  parts: AnyUIMessagePart[],
) {
  const reasoning =
    extractReasoningFromValuesMessage(message) ??
    extractReasoningFromContentBlocks(message);

  if (reasoning) {
    parts.push({ type: 'reasoning', text: reasoning, state: 'done' });
  }
}

function buildSourceProviderMetadata(
  citation: NormalizedCitation,
): ProviderMetadata | undefined {
  const langchain: Record<string, JSONValue> = {};

  if (typeof citation.citedText === 'string') {
    langchain.citedText = citation.citedText;
  }
  if (typeof citation.startIndex === 'number') {
    langchain.startIndex = citation.startIndex;
  }
  if (typeof citation.endIndex === 'number') {
    langchain.endIndex = citation.endIndex;
  }
  if (typeof citation.source === 'string') {
    langchain.source = citation.source;
  }

  return Object.keys(langchain).length > 0 ? { langchain } : undefined;
}

function addAssistantSourceParts(
  message: unknown,
  messageId: string,
  parts: AnyUIMessagePart[],
) {
  const citations = extractCitationsFromContentBlocks(message);
  const emittedSourceIds = new Set<string>();

  for (const citation of citations) {
    if (citation.url) {
      if (emittedSourceIds.has(citation.url)) continue;
      emittedSourceIds.add(citation.url);

      const providerMetadata = buildSourceProviderMetadata(citation);
      parts.push({
        type: 'source-url',
        sourceId: citation.url,
        url: citation.url,
        ...(citation.title ? { title: citation.title } : {}),
        ...(providerMetadata ? { providerMetadata } : {}),
      });
      continue;
    }

    const title = citation.title ?? citation.source;
    if (!title) continue;

    const sourceId = `${messageId}:${title}:${citation.citedText ?? ''}:${citation.startIndex ?? ''}:${citation.endIndex ?? ''}`;
    if (emittedSourceIds.has(sourceId)) continue;
    emittedSourceIds.add(sourceId);

    const providerMetadata = buildSourceProviderMetadata(citation);
    parts.push({
      type: 'source-document',
      sourceId,
      mediaType: 'text/plain',
      title,
      ...(providerMetadata ? { providerMetadata } : {}),
    });
  }
}

function addAssistantImageParts(message: unknown, parts: AnyUIMessagePart[]) {
  const additionalKwargs = getMessageData(message).additional_kwargs;
  if (additionalKwargs == null || typeof additionalKwargs !== 'object') return;

  for (const imageOutput of extractImageOutputs(
    additionalKwargs as Record<string, unknown>,
  )) {
    if (!imageOutput.result) continue;

    const mediaType = `image/${imageOutput.output_format || 'png'}`;
    parts.push({
      type: 'file',
      mediaType,
      url: `data:${mediaType};base64,${imageOutput.result}`,
    });
  }
}

function addToolCallParts(
  message: unknown,
  messageIndex: number,
  parts: AnyUIMessagePart[],
  toolPartsById: Map<
    string,
    Extract<AnyUIMessagePart, { type: 'dynamic-tool' }>
  >,
) {
  for (const toolCall of getToolCalls(message, messageIndex)) {
    if (!toolCall.id || !toolCall.name) continue;

    const part = {
      type: 'dynamic-tool' as const,
      toolName: toolCall.name,
      toolCallId: toolCall.id,
      state: 'input-available' as const,
      input: normalizeToolInput(toolCall.args),
    };

    toolPartsById.set(toolCall.id, part);
    parts.push(part);
  }
}

function collectInterruptActionRequests(snapshot: unknown) {
  const requests: InterruptActionRequest[] = [];
  const seenRequests = new Set<string>();

  function visitActionRequest(actionRequest: unknown) {
    if (actionRequest == null || typeof actionRequest !== 'object') return;

    const action = actionRequest as Record<string, unknown>;
    const name =
      typeof action.name === 'string'
        ? action.name
        : typeof action.action === 'string'
          ? action.action
          : typeof action.action_name === 'string'
            ? action.action_name
            : undefined;
    if (!name) return;

    const request = {
      id:
        typeof action.id === 'string'
          ? action.id
          : typeof action.tool_call_id === 'string'
            ? action.tool_call_id
            : typeof action.toolCallId === 'string'
              ? action.toolCallId
              : undefined,
      name,
      input: normalizeToolInput(
        action.args ?? action.arguments ?? action.input ?? action.action_input,
      ),
    };
    const requestKey = getInterruptActionRequestKey(request);
    if (seenRequests.has(requestKey)) return;

    seenRequests.add(requestKey);
    requests.push(request);
  }

  function visitInterruptValue(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visitInterruptValue(item);
      }
      return;
    }

    if (value == null || typeof value !== 'object') return;

    const record = value as Record<string, unknown>;
    const actionRequests = record.actionRequests ?? record.action_requests;
    if (Array.isArray(actionRequests)) {
      for (const actionRequest of actionRequests) {
        visitActionRequest(actionRequest);
      }
    }

    const prebuiltActionRequest = record.action_request ?? record.actionRequest;
    if (prebuiltActionRequest != null) {
      visitActionRequest(prebuiltActionRequest);
    }
  }

  if (snapshot != null && typeof snapshot === 'object') {
    const record = snapshot as Record<string, unknown>;
    const values = record.values;

    if (values != null && typeof values === 'object') {
      const valuesInterrupt = (values as Record<string, unknown>).__interrupt__;
      if (Array.isArray(valuesInterrupt)) {
        for (const interrupt of valuesInterrupt) {
          visitInterruptValue(
            interrupt != null && typeof interrupt === 'object'
              ? (interrupt as Record<string, unknown>).value
              : interrupt,
          );
        }
      }
    }

    const interrupts = record.interrupts;
    if (Array.isArray(interrupts) && interrupts.length > 0) {
      for (const interrupt of interrupts) {
        visitInterruptValue(
          interrupt != null && typeof interrupt === 'object'
            ? (interrupt as Record<string, unknown>).value
            : interrupt,
        );
      }
    } else {
      const tasks = record.tasks;
      if (!Array.isArray(tasks)) return requests;

      for (const task of tasks) {
        if (task == null || typeof task !== 'object') continue;

        const taskInterrupts = (task as Record<string, unknown>).interrupts;
        if (!Array.isArray(taskInterrupts)) continue;

        for (const interrupt of taskInterrupts) {
          visitInterruptValue(
            interrupt != null && typeof interrupt === 'object'
              ? (interrupt as Record<string, unknown>).value
              : interrupt,
          );
        }
      }
    }
  }

  return requests;
}

function applyInterrupts(
  messages: AnyUIMessage[],
  requests: InterruptActionRequest[],
) {
  type ToolPartLocation = {
    message: AnyUIMessage;
    partIndex: number;
    part: Extract<AnyUIMessagePart, { type: 'dynamic-tool' }>;
  };

  const interruptiblePartsById = new Map<string, ToolPartLocation>();
  const interruptiblePartsByKey = new Map<string, ToolPartLocation[]>();
  const usedToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'assistant') continue;

    for (let partIndex = 0; partIndex < message.parts.length; partIndex++) {
      const part = message.parts[partIndex];
      if (part.type !== 'dynamic-tool') continue;

      usedToolCallIds.add(part.toolCallId);

      if (
        part.state !== 'input-available' &&
        part.state !== 'input-streaming' &&
        part.state !== 'approval-requested'
      ) {
        continue;
      }

      const location = { message, partIndex, part };
      interruptiblePartsById.set(part.toolCallId, location);

      const partKey = getToolRequestKey(part.toolName, part.input);
      const locations = interruptiblePartsByKey.get(partKey) ?? [];
      locations.push(location);
      interruptiblePartsByKey.set(partKey, locations);
    }
  }

  requests.forEach((request, requestIndex) => {
    const matchingLocation =
      (request.id ? interruptiblePartsById.get(request.id) : undefined) ??
      interruptiblePartsByKey
        .get(getToolRequestKey(request.name, request.input))
        ?.at(-1);

    const matchingPart = matchingLocation?.part;
    const toolCallId = matchingPart
      ? matchingPart.toolCallId
      : makeUniqueId(
          request.id ?? `langgraph-interrupt-${requestIndex}`,
          usedToolCallIds,
        );
    const approval = {
      id: toolCallId,
    };

    if (matchingPart != null && matchingLocation != null) {
      const approvalPart: Extract<AnyUIMessagePart, { type: 'dynamic-tool' }> =
        {
          type: 'dynamic-tool',
          toolName: matchingPart.toolName,
          toolCallId,
          title: matchingPart.title,
          toolMetadata: matchingPart.toolMetadata,
          providerExecuted: matchingPart.providerExecuted,
          callProviderMetadata: matchingPart.callProviderMetadata,
          state: 'approval-requested',
          input: matchingPart.input,
          approval,
        };
      matchingLocation.message.parts[matchingLocation.partIndex] = approvalPart;
      return;
    }

    let assistantMessage = messages.findLast(
      message => message.role === 'assistant',
    );
    if (assistantMessage == null) {
      assistantMessage = {
        id: `langgraph-interrupt-message-${messages.length}`,
        role: 'assistant',
        parts: [],
      };
      messages.push(assistantMessage);
    }

    assistantMessage.parts.push({
      type: 'dynamic-tool',
      toolName: request.name,
      toolCallId,
      state: 'approval-requested',
      input: normalizeToolInput(request.input),
      approval,
    });
  });
}

/**
 * Converts LangChain BaseMessage objects to AI SDK UIMessage objects.
 *
 * ToolMessage entries are folded back into the assistant tool invocation with
 * the matching tool call id so the result can be passed to useChat as messages.
 */
export function baseMessagesToUIMessages(messages: BaseMessage[]): UIMessage[] {
  const uiMessages: AnyUIMessage[] = [];
  const usedMessageIds = new Set<string>();
  const toolPartsById = new Map<
    string,
    Extract<AnyUIMessagePart, { type: 'dynamic-tool' }>
  >();

  messages.forEach((message, index) => {
    const type = getMessageType(message);

    if (type === 'system') {
      const parts = ensureNonEmptyParts(
        createUIPartsFromMessageContent(message, { includeFiles: false }),
      );
      uiMessages.push({
        id: createUniqueMessageId(message, index, usedMessageIds),
        role: 'system',
        parts,
      });
      return;
    }

    if (type === 'human' || type === 'user') {
      const parts = ensureNonEmptyParts(
        createUIPartsFromMessageContent(message),
      );
      uiMessages.push({
        id: createUniqueMessageId(message, index, usedMessageIds),
        role: 'user',
        parts,
      });
      return;
    }

    if (type === 'ai' || type === 'assistant') {
      const messageId = createUniqueMessageId(message, index, usedMessageIds);
      const parts: AnyUIMessagePart[] = [];
      addAssistantReasoningParts(message, parts);
      parts.push(...createUIPartsFromMessageContent(message));
      addAssistantSourceParts(message, messageId, parts);
      addAssistantImageParts(message, parts);
      addToolCallParts(message, index, parts, toolPartsById);

      uiMessages.push({
        id: messageId,
        role: 'assistant',
        parts: ensureNonEmptyParts(parts),
      });
      return;
    }

    if (type === 'tool' || type === 'function') {
      const toolCallId = getToolCallId(message);
      const fallbackToolCallId = toolCallId ?? createMessageId(message, index);

      const toolPart = toolCallId ? toolPartsById.get(toolCallId) : undefined;
      const { output, errorText } = getToolOutput(message);

      if (toolPart != null) {
        if (errorText != null) {
          delete (toolPart as { output?: unknown }).output;
          Object.assign(toolPart, {
            state: 'output-error',
            errorText,
          });
        } else {
          delete (toolPart as { errorText?: string }).errorText;
          Object.assign(toolPart, {
            state: 'output-available',
            output,
          });
        }
        return;
      }

      const data = getMessageData(message);
      const toolName =
        typeof data.name === 'string' && data.name ? data.name : 'unknown';
      const fallbackToolPart =
        errorText != null
          ? {
              type: 'dynamic-tool' as const,
              toolName,
              toolCallId: fallbackToolCallId,
              state: 'output-error' as const,
              input: {},
              errorText,
            }
          : {
              type: 'dynamic-tool' as const,
              toolName,
              toolCallId: fallbackToolCallId,
              state: 'output-available' as const,
              input: {},
              output,
            };

      uiMessages.push({
        id: createUniqueMessageId(message, index, usedMessageIds),
        role: 'assistant',
        parts: [fallbackToolPart],
      });
    }
  });

  return uiMessages;
}

/**
 * Converts a LangGraph StateSnapshot into AI SDK UIMessage objects.
 */
export function stateSnapshotToUIMessages(
  snapshot: StateSnapshot,
): UIMessage[] {
  const values = (snapshot as unknown as { values?: unknown }).values;
  const messages =
    values != null &&
    typeof values === 'object' &&
    Array.isArray((values as { messages?: unknown }).messages)
      ? ((values as { messages: BaseMessage[] }).messages ?? [])
      : [];

  const uiMessages = baseMessagesToUIMessages(messages) as AnyUIMessage[];
  applyInterrupts(uiMessages, collectInterruptActionRequests(snapshot));

  return uiMessages;
}

/**
 * Converts AI SDK UIMessages to LangChain BaseMessage objects.
 *
 * This function transforms the AI SDK's message format into LangChain's message
 * format, enabling seamless integration between the two frameworks.
 *
 * @param messages - Array of AI SDK UIMessage objects to convert.
 * @returns Promise resolving to an array of LangChain BaseMessage objects.
 *
 * @example
 * ```ts
 * import { toBaseMessages } from '@ai-sdk/langchain';
 *
 * const langchainMessages = await toBaseMessages(uiMessages);
 *
 * // Use with LangChain
 * const response = await model.invoke(langchainMessages);
 * ```
 */
export async function toBaseMessages(
  messages: UIMessage[],
): Promise<BaseMessage[]> {
  const modelMessages = await convertToModelMessages(messages);
  return convertModelMessages(modelMessages);
}

/**
 * Converts ModelMessages to LangChain BaseMessage objects.
 *
 * @param modelMessages - Array of ModelMessage objects from convertToModelMessages.
 * @returns Array of LangChain BaseMessage objects.
 */
export function convertModelMessages(
  modelMessages: ModelMessage[],
): BaseMessage[] {
  const result: BaseMessage[] = [];

  for (const message of modelMessages) {
    switch (message.role) {
      case 'tool': {
        // Tool messages contain an array of tool results
        for (const item of message.content) {
          if (isToolResultPart(item)) {
            result.push(convertToolResultPart(item));
          }
        }
        break;
      }

      case 'assistant': {
        result.push(convertAssistantContent(message.content));
        break;
      }

      case 'system': {
        result.push(new SystemMessage({ content: message.content }));
        break;
      }

      case 'user': {
        result.push(convertUserContent(message.content));
        break;
      }
    }
  }

  return result;
}

/**
 * Type guard to check if a value is a streamEvents event object.
 * streamEvents produces objects with `event` and `data` properties.
 *
 * @param value - The value to check.
 * @returns True if the value is a streamEvents event object.
 */
function isStreamEventsEvent(
  value: unknown,
): value is { event: string; data: Record<string, unknown> } {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  // Check for event property being a string
  if (!('event' in obj) || typeof obj.event !== 'string') return false;
  // Check for data property being an object (but allow null/undefined)
  if (!('data' in obj)) return false;
  // data can be null in some events, treat as empty object
  return obj.data === null || typeof obj.data === 'object';
}

/**
 * Processes a streamEvents event and emits UI message chunks.
 *
 * @param event - The streamEvents event to process.
 * @param state - The state for tracking stream progress.
 * @param controller - The controller to emit UI message chunks.
 */
function processStreamEventsEvent(
  event: {
    event: string;
    data: Record<string, unknown> | null;
    run_id?: string;
    name?: string;
  },
  state: {
    started: boolean;
    messageId: string;
    reasoningStarted: boolean;
    textStarted: boolean;
    textMessageId: string | null;
    reasoningMessageId: string | null;
    emittedSourceIds: Set<string>;
  },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  /**
   * Capture run_id from event level if available (streamEvents v2 format)
   */
  if (event.run_id && !state.started) {
    state.messageId = event.run_id;
  }

  /**
   * Skip events with null/undefined data
   */
  if (!event.data) return;

  switch (event.event) {
    case 'on_chat_model_start': {
      /**
       * End the previous model turn's reasoning stream before a new LLM invocation.
       * Without this, reasoning-delta chunks from the next turn could attach to the
       * wrong reasoning part in the UI message stream.
       */
      if (state.reasoningStarted) {
        controller.enqueue({
          type: 'reasoning-end',
          id:
            state.reasoningMessageId != null
              ? state.reasoningMessageId
              : state.messageId,
        });
        state.reasoningStarted = false;
        state.reasoningMessageId = null;
      }

      /**
       * End the previous model turn's text stream before a new LLM invocation.
       * The streamEvents adapter otherwise leaves `textStarted` true, so all later
       * text-delta chunks append to the first text part — tools still grow the parts
       * array, which breaks chronological order in the assistant message.
       */
      if (state.textStarted) {
        controller.enqueue({
          type: 'text-end',
          id:
            state.textMessageId != null ? state.textMessageId : state.messageId,
        });
        state.textStarted = false;
        state.textMessageId = null;
      }

      /**
       * Handle model start — capture message metadata if available.
       * `run_id` is on the event in streamEvents v2; fall back to `data` for compatibility.
       */
      const runId = event.run_id || (event.data.run_id as string | undefined);
      if (runId) {
        state.messageId = runId;
      }
      break;
    }

    case 'on_chat_model_stream': {
      /**
       * Handle streaming token chunks
       */
      const chunk = event.data.chunk;
      if (chunk && typeof chunk === 'object') {
        /**
         * Get message ID from chunk if available
         */
        const chunkId = (chunk as { id?: string }).id;
        if (chunkId) {
          state.messageId = chunkId;
        }

        /**
         * Handle reasoning content from contentBlocks
         */
        const reasoning = extractReasoningFromContentBlocks(chunk);
        if (reasoning) {
          if (!state.reasoningStarted) {
            // Track the ID used for reasoning-start to ensure reasoning-end uses the same ID
            state.reasoningMessageId = state.messageId;
            controller.enqueue({
              type: 'reasoning-start',
              id: state.messageId,
            });
            state.reasoningStarted = true;
            state.started = true;
          }
          controller.enqueue({
            type: 'reasoning-delta',
            delta: reasoning,
            id: state.reasoningMessageId ?? state.messageId,
          });
        }

        /**
         * Extract text content from chunk
         */
        const content = (chunk as { content?: unknown }).content;
        const text =
          typeof content === 'string'
            ? content
            : Array.isArray(content)
              ? content
                  .filter(
                    (c): c is { type: 'text'; text: string } =>
                      typeof c === 'object' &&
                      c !== null &&
                      'type' in c &&
                      c.type === 'text',
                  )
                  .map(c => c.text)
                  .join('')
              : '';

        if (text) {
          /**
           * If reasoning was streamed before text, close reasoning first
           */
          if (state.reasoningStarted && !state.textStarted) {
            controller.enqueue({
              type: 'reasoning-end',
              id: state.reasoningMessageId ?? state.messageId,
            });
            state.reasoningStarted = false;
          }

          if (!state.textStarted) {
            // Track the ID used for text-start to ensure text-end uses the same ID
            state.textMessageId = state.messageId;
            controller.enqueue({ type: 'text-start', id: state.messageId });
            state.textStarted = true;
            state.started = true;
          }
          controller.enqueue({
            type: 'text-delta',
            delta: text,
            id: state.textMessageId ?? state.messageId,
          });
        }

        const citations = extractCitationsFromContentBlocks(chunk);
        if (citations.length > 0) {
          emitSourceChunks(
            citations,
            state.messageId,
            state.emittedSourceIds,
            controller,
          );
        }
      }
      break;
    }

    case 'on_tool_start': {
      /**
       * Handle tool call start
       * run_id and name are at event level in v2, check data for backwards compatibility
       */
      const runId = event.run_id || (event.data.run_id as string | undefined);
      const name = event.name || (event.data.name as string | undefined);

      if (runId && name) {
        controller.enqueue({
          type: 'tool-input-start',
          toolCallId: runId,
          toolName: name,
          dynamic: true,
        });
      }
      break;
    }

    case 'on_tool_end': {
      /**
       * Handle tool call end
       * run_id is at event level in v2, check data for backwards compatibility
       */
      const runId = event.run_id || (event.data.run_id as string | undefined);
      const output = event.data.output;

      if (runId) {
        controller.enqueue({
          type: 'tool-output-available',
          toolCallId: runId,
          output,
        });
      }
      break;
    }
  }
}

/**
 * Checks if an error is an abort error.
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      (error instanceof DOMException && error.name === 'AbortError')
    );
  }
  return false;
}

/**
 * Converts a LangChain stream to an AI SDK UIMessageStream.
 *
 * This function automatically detects the stream type and handles:
 * - Direct model streams (AsyncIterable from `model.stream()`)
 * - LangGraph streams (ReadableStream with `streamMode: ['values', 'messages']`)
 * - streamEvents streams (from `agent.streamEvents()` or `model.streamEvents()`)
 *
 * @param stream - A stream from LangChain model.stream(), graph.stream(), or streamEvents().
 * @param callbacks - Optional callbacks for stream lifecycle events.
 * @returns A ReadableStream of UIMessageChunk objects.
 *
 * @example
 * ```ts
 * // With a direct model stream
 * const model = new ChatOpenAI({ model: 'gpt-4o-mini' });
 * const stream = await model.stream(messages);
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream(stream),
 * });
 *
 * // With a LangGraph stream
 * const graphStream = await graph.stream(
 *   { messages },
 *   { streamMode: ['values', 'messages'] }
 * );
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream(graphStream),
 * });
 *
 * // With streamEvents
 * const streamEvents = agent.streamEvents(
 *   { messages },
 *   { version: "v2" }
 * );
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream(streamEvents),
 * });
 *
 * // With callbacks for LangGraph state
 * const graphStream = await graph.stream(
 *   { messages },
 *   { streamMode: ['values', 'messages'] }
 * );
 * return createUIMessageStreamResponse({
 *   stream: toUIMessageStream<MyStateType>(graphStream, {
 *     onFinish: async (finalState) => {
 *       if (finalState) {
 *         await saveToDatabase(finalState);
 *       }
 *     },
 *     onError: (error) => console.error('Stream failed:', error),
 *     onAbort: () => console.log('Stream aborted'),
 *   }),
 * });
 * ```
 */
export function toUIMessageStream<TState = unknown>(
  stream: AsyncIterable<AIMessageChunk> | ReadableStream,
  callbacks?: StreamCallbacks<TState>,
): ReadableStream<UIMessageChunk> {
  /**
   * Track text chunks for onFinal callback
   */
  const textChunks: string[] = [];

  /** Last LangGraph values event data for onFinish callback */
  let lastValuesData: TState | undefined;

  /**
   * State for model stream handling
   */
  const modelState = {
    started: false,
    messageId: 'langchain-msg-1',
    reasoningStarted: false,
    textStarted: false,
    /** Track the ID used for text-start to ensure text-end uses the same ID */
    textMessageId: null as string | null,
    /** Track the ID used for reasoning-start to ensure reasoning-end uses the same ID */
    reasoningMessageId: null as string | null,
    emittedSourceIds: new Set<string>(),
  };

  /**
   * State for LangGraph stream handling
   */
  const langGraphState: LangGraphEventState = {
    messageSeen: new Map(),
    messageConcat: new Map(),
    emittedToolCalls: new Set<string>(),
    emittedToolInputs: new Set<string>(),
    emittedImages: new Set<string>(),
    emittedReasoningIds: new Set<string>(),
    messageReasoningIds: new Map(),
    toolCallInfoByIndex: new Map(),
    currentStep: null as number | null,
    emittedToolCallsByKey: new Map<string, string>(),
    emittedSourceIds: new Set<string>(),
  };

  /**
   * Track detected stream type: null = not yet detected
   */
  let streamType: 'model' | 'langgraph' | 'streamEvents' | null = null;

  /**
   * Get async iterator from the stream (works for both AsyncIterable and ReadableStream)
   */
  const getAsyncIterator = (): AsyncIterator<unknown> => {
    if (Symbol.asyncIterator in stream) {
      return (stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }
    /**
     * For ReadableStream without Symbol.asyncIterator
     */
    const reader = (stream as ReadableStream).getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        return { done, value };
      },
    };
  };

  const iterator = getAsyncIterator();

  /**
   * Create a wrapper around the controller to intercept text chunks for callbacks
   */
  const createCallbackController = (
    originalController: ReadableStreamDefaultController<UIMessageChunk>,
  ): ReadableStreamDefaultController<UIMessageChunk> => {
    return {
      get desiredSize() {
        return originalController.desiredSize;
      },
      close: () => originalController.close(),
      error: (e?: unknown) => originalController.error(e),
      enqueue: (chunk: UIMessageChunk) => {
        /**
         * Intercept text-delta chunks for callbacks
         */
        if (callbacks && chunk.type === 'text-delta' && chunk.delta) {
          textChunks.push(chunk.delta);
          callbacks.onToken?.(chunk.delta);
          callbacks.onText?.(chunk.delta);
        }
        originalController.enqueue(chunk);
      },
    };
  };

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      await callbacks?.onStart?.();

      const wrappedController = createCallbackController(controller);
      controller.enqueue({ type: 'start' });

      try {
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;

          /**
           * Detect stream type on first value
           */
          if (streamType === null) {
            if (Array.isArray(value)) {
              streamType = 'langgraph';
            } else if (isStreamEventsEvent(value)) {
              streamType = 'streamEvents';
            } else {
              streamType = 'model';
            }
          }

          /**
           * Process based on detected type
           */
          if (streamType === 'model') {
            processModelChunk(
              value as AIMessageChunk,
              modelState,
              wrappedController,
            );
          } else if (streamType === 'streamEvents') {
            processStreamEventsEvent(
              value as {
                event: string;
                data: Record<string, unknown> | null;
                run_id?: string;
                name?: string;
              },
              modelState,
              wrappedController,
            );
          } else {
            const eventArray = value as unknown[];
            const [type, data] = parseLangGraphEvent(eventArray);

            if (type === 'values') {
              lastValuesData = data as TState;
            }

            processLangGraphEvent(
              eventArray,
              langGraphState,
              wrappedController,
            );
          }
        }

        /**
         * Finalize based on stream type
         */
        if (streamType === 'model' || streamType === 'streamEvents') {
          if (modelState.reasoningStarted) {
            controller.enqueue({
              type: 'reasoning-end',
              id: modelState.reasoningMessageId ?? modelState.messageId,
            });
          }
          if (modelState.textStarted) {
            /**
             * Use the same ID that was used for text-start
             */
            controller.enqueue({
              type: 'text-end',
              id: modelState.textMessageId ?? modelState.messageId,
            });
          }
          controller.enqueue({ type: 'finish' });
        } else if (streamType === 'langgraph') {
          /**
           * Close any open text/reasoning parts before finishing.
           * This handles streams without values events (e.g. streamMode: 'messages')
           * where the values handler never ran to emit *-end events.
           */
          for (const [id, seen] of langGraphState.messageSeen) {
            if (seen.text) {
              controller.enqueue({ type: 'text-end', id });
            }
            if (seen.reasoning) {
              controller.enqueue({ type: 'reasoning-end', id });
            }
          }

          /**
           * Emit finish-step if a step was started
           */
          if (langGraphState.currentStep !== null) {
            controller.enqueue({ type: 'finish-step' });
          }
          controller.enqueue({ type: 'finish' });
        }

        /**
         * Call onFinal callback with aggregated text
         */
        await callbacks?.onFinal?.(textChunks.join(''));
        await callbacks?.onFinish?.(lastValuesData);
      } catch (error) {
        const errorObj =
          error instanceof Error ? error : new Error(String(error));

        await callbacks?.onFinal?.(textChunks.join(''));

        if (isAbortError(error)) {
          await callbacks?.onAbort?.();
        } else {
          await callbacks?.onError?.(errorObj);
        }

        controller.enqueue({
          type: 'error',
          errorText: errorObj.message,
        });
      } finally {
        controller.close();
      }
    },
  });
}
