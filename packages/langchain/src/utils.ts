import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  BaseMessage,
  AIMessageChunk,
  BaseMessageChunk,
  ToolCallChunk,
  type ToolCall,
} from '@langchain/core/messages';
import {
  type UIMessageChunk,
  type ToolResultPart,
  type AssistantContent,
  type UserContent,
} from 'ai';

import {
  type LangGraphEventState,
  type ReasoningContentBlock,
  type ThinkingContentBlock,
  type GPT5ReasoningOutput,
  type ImageGenerationOutput,
} from './types';

/**
 * Converts a ToolResultPart to a LangChain ToolMessage
 * @param block - The ToolResultPart to convert.
 * @returns The converted ToolMessage.
 */
export function convertToolResultPart(block: ToolResultPart): ToolMessage {
  const content = (() => {
    if (block.output.type === 'text' || block.output.type === 'error-text') {
      return block.output.value;
    }

    if (block.output.type === 'json' || block.output.type === 'error-json') {
      return JSON.stringify(block.output.value);
    }

    if (block.output.type === 'content') {
      return block.output.value
        .map(outputBlock => {
          if (outputBlock.type === 'text') {
            return outputBlock.text;
          }
          return '';
        })
        .join('');
    }

    return '';
  })();

  return new ToolMessage({
    tool_call_id: block.toolCallId,
    content,
  });
}

/**
 * Converts AssistantContent to LangChain AIMessage
 * @param content - The AssistantContent to convert.
 * @returns The converted AIMessage.
 */
export function convertAssistantContent(content: AssistantContent): AIMessage {
  if (typeof content === 'string') {
    return new AIMessage({ content });
  }

  const textParts: string[] = [];
  const toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }> = [];

  for (const part of content) {
    if (part.type === 'text') {
      textParts.push(part.text);
    } else if (part.type === 'tool-call') {
      toolCalls.push({
        id: part.toolCallId,
        name: part.toolName,
        args: part.input as Record<string, unknown>,
      });
    }
  }

  return new AIMessage({
    content: textParts.join(''),
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  });
}

/**
 * Converts UserContent to LangChain HumanMessage
 * @param content - The UserContent to convert.
 * @returns The converted HumanMessage.
 */
export function convertUserContent(content: UserContent): HumanMessage {
  if (typeof content === 'string') {
    return new HumanMessage({ content });
  }

  const textParts = content
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map(part => part.text);

  return new HumanMessage({ content: textParts.join('') });
}

/**
 * Helper to check if a content item is a ToolResultPart
 * @param item - The item to check.
 * @returns True if the item is a ToolResultPart, false otherwise.
 */
export function isToolResultPart(item: unknown): item is ToolResultPart {
  return (
    item != null &&
    typeof item === 'object' &&
    'type' in item &&
    (item as { type: string }).type === 'tool-result'
  );
}

/**
 * Processes a model stream chunk and emits UI message chunks.
 * @param chunk - The AIMessageChunk to process.
 * @param state - The state of the model stream.
 * @param controller - The controller to use to emit the UI message chunks.
 */
export function processModelChunk(
  chunk: AIMessageChunk,
  state: {
    started: boolean;
    messageId: string;
    reasoningStarted?: boolean;
    textStarted?: boolean;
  },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  /**
   * Get the message ID from the chunk if available
   */
  if (chunk.id) {
    state.messageId = chunk.id;
  }

  /**
   * Handle reasoning content from contentBlocks or response_metadata.output
   * For direct model streams, we check both sources since there's no values event
   * that would cause duplication (unlike LangGraph streams)
   */
  const reasoning =
    extractReasoningFromContentBlocks(chunk) ||
    extractReasoningFromValuesMessage(chunk);
  if (reasoning) {
    if (!state.reasoningStarted) {
      controller.enqueue({ type: 'reasoning-start', id: state.messageId });
      state.reasoningStarted = true;
      state.started = true;
    }
    controller.enqueue({
      type: 'reasoning-delta',
      delta: reasoning,
      id: state.messageId,
    });
  }

  /**
   * Extract text content from AIMessageChunk
   */
  const text =
    typeof chunk.content === 'string'
      ? chunk.content
      : Array.isArray(chunk.content)
        ? chunk.content
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
      controller.enqueue({ type: 'reasoning-end', id: state.messageId });
      state.reasoningStarted = false;
    }

    if (!state.textStarted) {
      controller.enqueue({ type: 'text-start', id: state.messageId });
      state.textStarted = true;
      state.started = true;
    }
    controller.enqueue({
      type: 'text-delta',
      delta: text,
      id: state.messageId,
    });
  }
}

/**
 * Checks if a message is a plain object (not a LangChain class instance).
 * LangChain class instances have a _getType method.
 *
 * @param msg - The message to check.
 * @returns True if the message is a plain object, false otherwise.
 */
export function isPlainMessageObject(msg: unknown): boolean {
  if (msg == null || typeof msg !== 'object') return false;
  /**
   * LangChain class instances have _getType method
   */
  return typeof (msg as { _getType?: unknown })._getType !== 'function';
}

/**
 * Extracts the actual message ID from a message.
 * Handles both class instances (msg.id) and serialized LangChain messages (msg.kwargs.id).
 *
 * @param msg - The message to extract the ID from.
 * @returns The message ID string, or undefined if not found.
 */
export function getMessageId(msg: unknown): string | undefined {
  if (msg == null || typeof msg !== 'object') return undefined;

  const msgObj = msg as Record<string, unknown>;

  /**
   * For class instances, id is directly on the object
   */
  if (typeof msgObj.id === 'string') {
    return msgObj.id;
  }

  /**
   * For serialized LangChain messages, id is in kwargs
   */
  if (
    msgObj.type === 'constructor' &&
    msgObj.kwargs &&
    typeof msgObj.kwargs === 'object'
  ) {
    const kwargs = msgObj.kwargs as Record<string, unknown>;
    if (typeof kwargs.id === 'string') {
      return kwargs.id;
    }
  }

  return undefined;
}

/**
 * Checks if a message is an AI message chunk (works for both class instances and plain objects).
 * For class instances, only AIMessageChunk is matched (not AIMessage).
 * For plain objects from RemoteGraph API, matches type === 'ai'.
 * For serialized LangChain messages, matches type === 'constructor' with AIMessageChunk in id path.
 *
 * @param msg - The message to check.
 * @returns True if the message is an AI message chunk, false otherwise.
 */
export function isAIMessageChunk(
  msg: unknown,
): msg is AIMessageChunk & { type?: string; content?: string } {
  /**
   * Actual AIMessageChunk class instance
   */
  if (AIMessageChunk.isInstance(msg)) return true;
  /**
   * Plain object from RemoteGraph API (not a LangChain class instance)
   */
  if (isPlainMessageObject(msg)) {
    const obj = msg as Record<string, unknown>;
    /**
     * Direct type === 'ai' (RemoteGraph format)
     */
    if ('type' in obj && obj.type === 'ai') return true;
    /**
     * Serialized LangChain message format: { lc: 1, type: "constructor", id: ["...", "AIMessageChunk"], kwargs: {...} }
     */
    if (
      obj.type === 'constructor' &&
      Array.isArray(obj.id) &&
      (obj.id.includes('AIMessageChunk') || obj.id.includes('AIMessage'))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a message is a Tool message (works for both class instances and plain objects).
 *
 * @param msg - The message to check.
 * @returns True if the message is a Tool message, false otherwise.
 */
export function isToolMessageType(
  msg: unknown,
): msg is ToolMessage & { type?: string; tool_call_id?: string } {
  if (ToolMessage.isInstance(msg)) return true;
  /**
   * Plain object from RemoteGraph API (not a LangChain class instance)
   */
  if (isPlainMessageObject(msg)) {
    const obj = msg as Record<string, unknown>;
    // Direct type === 'tool' (RemoteGraph format)
    if ('type' in obj && obj.type === 'tool') return true;
    // Serialized LangChain message format
    if (
      obj.type === 'constructor' &&
      Array.isArray(obj.id) &&
      obj.id.includes('ToolMessage')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Gets text content from a message (works for both class instances and plain objects).
 *
 * @param msg - The message to get the text from.
 * @returns The text content of the message.
 */
export function getMessageText(msg: unknown): string {
  if (AIMessageChunk.isInstance(msg)) {
    return msg.text ?? '';
  }

  if (msg == null || typeof msg !== 'object') return '';

  const msgObj = msg as Record<string, unknown>;

  // For serialized LangChain messages, content is in kwargs
  const dataSource =
    msgObj.type === 'constructor' &&
    msgObj.kwargs &&
    typeof msgObj.kwargs === 'object'
      ? (msgObj.kwargs as Record<string, unknown>)
      : msgObj;

  if ('content' in dataSource) {
    const content = dataSource.content;
    /**
     * Handle string content
     */
    if (typeof content === 'string') {
      return content;
    }
    /**
     * Handle array of content blocks (e.g., [{ type: 'text', text: 'The', index: 0 }])
     */
    if (Array.isArray(content)) {
      return content
        .filter(
          (block): block is { type: 'text'; text: string } =>
            block != null &&
            typeof block === 'object' &&
            block.type === 'text' &&
            typeof block.text === 'string',
        )
        .map(block => block.text)
        .join('');
    }
    return '';
  }
  return '';
}

/**
 * Checks if an object is a reasoning content block
 *
 * @param obj - The object to check.
 * @returns True if the object is a reasoning content block, false otherwise.
 */
export function isReasoningContentBlock(
  obj: unknown,
): obj is ReasoningContentBlock {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'type' in obj &&
    (obj as { type: string }).type === 'reasoning' &&
    'reasoning' in obj &&
    typeof (obj as { reasoning: unknown }).reasoning === 'string'
  );
}

/**
 * Checks if an object is a thinking content block (Anthropic-style)
 *
 * @param obj - The object to check.
 * @returns True if the object is a thinking content block, false otherwise.
 */
export function isThinkingContentBlock(
  obj: unknown,
): obj is ThinkingContentBlock {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'type' in obj &&
    (obj as { type: string }).type === 'thinking' &&
    'thinking' in obj &&
    typeof (obj as { thinking: unknown }).thinking === 'string'
  );
}

/**
 * Checks if an object is a GPT-5 reasoning output block
 */
function isGPT5ReasoningOutput(obj: unknown): obj is GPT5ReasoningOutput {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'type' in obj &&
    (obj as { type: string }).type === 'reasoning' &&
    'summary' in obj &&
    Array.isArray((obj as { summary: unknown }).summary)
  );
}

/**
 * Extracts the reasoning block ID from a message (GPT-5 format).
 * This ID is consistent across streaming and values events.
 * Handles both class instances and serialized LangChain message objects.
 *
 * @param msg - The message to extract the reasoning ID from.
 * @returns The reasoning block ID if found, undefined otherwise.
 */
export function extractReasoningId(msg: unknown): string | undefined {
  if (msg == null || typeof msg !== 'object') return undefined;

  // For serialized LangChain messages, the data is in kwargs
  const msgObj = msg as Record<string, unknown>;
  const kwargs =
    msgObj.kwargs && typeof msgObj.kwargs === 'object'
      ? (msgObj.kwargs as Record<string, unknown>)
      : msgObj;

  // Check additional_kwargs.reasoning.id (GPT-5 streaming format)
  const additionalKwargs = (
    kwargs as { additional_kwargs?: { reasoning?: { id?: string } } }
  ).additional_kwargs;
  if (additionalKwargs?.reasoning?.id) {
    return additionalKwargs.reasoning.id;
  }

  // Check response_metadata.output for reasoning block ID (GPT-5 final format)
  const responseMetadata = (
    kwargs as { response_metadata?: { output?: unknown[] } }
  ).response_metadata;
  if (responseMetadata && Array.isArray(responseMetadata.output)) {
    for (const item of responseMetadata.output) {
      if (isGPT5ReasoningOutput(item)) {
        return item.id;
      }
    }
  }

  return undefined;
}

/**
 * Extracts reasoning content from contentBlocks or additional_kwargs.reasoning.summary
 *
 * IMPORTANT: This function is designed for STREAMING chunks where content is delta-based.
 * It does NOT extract from response_metadata.output because that contains accumulated
 * content (not deltas) and would cause duplication during streaming.
 *
 * For non-streaming/values events, use extractReasoningFromValuesMessage instead.
 *
 * Handles both class instances and serialized LangChain message objects.
 *
 * @param msg - The message to extract reasoning from.
 * @returns The reasoning text if found, undefined otherwise.
 */
export function extractReasoningFromContentBlocks(
  msg: unknown,
): string | undefined {
  if (msg == null || typeof msg !== 'object') return undefined;

  // For serialized LangChain messages, the data is in kwargs
  const msgObj = msg as Record<string, unknown>;
  const kwargs =
    msgObj.kwargs && typeof msgObj.kwargs === 'object'
      ? (msgObj.kwargs as Record<string, unknown>)
      : msgObj;

  // Check contentBlocks (Anthropic-style) - highest priority
  const contentBlocks = (kwargs as { contentBlocks?: unknown[] }).contentBlocks;
  if (Array.isArray(contentBlocks)) {
    const reasoningParts: string[] = [];
    for (const block of contentBlocks) {
      if (isReasoningContentBlock(block)) {
        reasoningParts.push(block.reasoning);
      } else if (isThinkingContentBlock(block)) {
        reasoningParts.push(block.thinking);
      }
    }
    if (reasoningParts.length > 0) {
      return reasoningParts.join('');
    }
  }

  // Check additional_kwargs.reasoning.summary (GPT-5 streaming format)
  // This contains DELTA content during streaming, not accumulated content
  // Format can be either { type: "summary_text", text: "..." } or just { text: "..." }
  const additionalKwargs = (
    kwargs as { additional_kwargs?: { reasoning?: { summary?: unknown[] } } }
  ).additional_kwargs;
  if (
    additionalKwargs?.reasoning &&
    Array.isArray(additionalKwargs.reasoning.summary)
  ) {
    const reasoningParts: string[] = [];
    for (const summaryItem of additionalKwargs.reasoning.summary) {
      if (
        typeof summaryItem === 'object' &&
        summaryItem !== null &&
        'text' in summaryItem &&
        typeof (summaryItem as { text: unknown }).text === 'string'
      ) {
        reasoningParts.push((summaryItem as { text: string }).text);
      }
    }
    if (reasoningParts.length > 0) {
      return reasoningParts.join('');
    }
  }

  return undefined;
}

/**
 * Extracts reasoning content from a values event message.
 * This checks response_metadata.output which contains the full accumulated reasoning.
 *
 * @param msg - The message to extract reasoning from.
 * @returns The reasoning text if found, undefined otherwise.
 */
export function extractReasoningFromValuesMessage(
  msg: unknown,
): string | undefined {
  if (msg == null || typeof msg !== 'object') return undefined;

  // For serialized LangChain messages, the data is in kwargs
  const msgObj = msg as Record<string, unknown>;
  const kwargs =
    msgObj.kwargs && typeof msgObj.kwargs === 'object'
      ? (msgObj.kwargs as Record<string, unknown>)
      : msgObj;

  // Check response_metadata.output (GPT-5 final style) - for values events
  const responseMetadata = (
    kwargs as { response_metadata?: { output?: unknown[] } }
  ).response_metadata;
  if (responseMetadata && Array.isArray(responseMetadata.output)) {
    const reasoningParts: string[] = [];
    for (const item of responseMetadata.output) {
      if (isGPT5ReasoningOutput(item)) {
        // Extract text from summary array - handles both { type: "summary_text", text } and { text } formats
        for (const summaryItem of item.summary) {
          if (typeof summaryItem === 'object' && summaryItem !== null) {
            const text = (summaryItem as { text?: string }).text;
            if (typeof text === 'string' && text) {
              reasoningParts.push(text);
            }
          }
        }
      }
    }
    if (reasoningParts.length > 0) {
      return reasoningParts.join('');
    }
  }

  // Also check additional_kwargs.reasoning.summary as fallback
  const additionalKwargs = (
    kwargs as { additional_kwargs?: { reasoning?: { summary?: unknown[] } } }
  ).additional_kwargs;
  if (
    additionalKwargs?.reasoning &&
    Array.isArray(additionalKwargs.reasoning.summary)
  ) {
    const reasoningParts: string[] = [];
    for (const summaryItem of additionalKwargs.reasoning.summary) {
      if (
        typeof summaryItem === 'object' &&
        summaryItem !== null &&
        'text' in summaryItem &&
        typeof (summaryItem as { text: unknown }).text === 'string'
      ) {
        reasoningParts.push((summaryItem as { text: string }).text);
      }
    }
    if (reasoningParts.length > 0) {
      return reasoningParts.join('');
    }
  }

  return undefined;
}

/**
 * Checks if an object is an image generation output
 *
 * @param obj - The object to check.
 * @returns True if the object is an image generation output, false otherwise.
 */
export function isImageGenerationOutput(
  obj: unknown,
): obj is ImageGenerationOutput {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'type' in obj &&
    (obj as { type: string }).type === 'image_generation_call'
  );
}

/**
 * Extracts image generation outputs from `additional_kwargs`
 *
 * @param additionalKwargs - The additional kwargs to extract the image generation outputs from.
 * @returns The image generation outputs.
 */
export function extractImageOutputs(
  additionalKwargs: Record<string, unknown> | undefined,
): ImageGenerationOutput[] {
  if (!additionalKwargs) return [];

  const toolOutputs = additionalKwargs.tool_outputs;
  if (!Array.isArray(toolOutputs)) return [];

  return toolOutputs.filter(isImageGenerationOutput);
}

/**
 * Processes a LangGraph event and emits UI message chunks.
 *
 * @param event - The event to process.
 * @param state - The state of the LangGraph event.
 * @param controller - The controller to use to emit the UI message chunks.
 */
export function processLangGraphEvent(
  event: unknown[],
  state: LangGraphEventState,
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  const {
    messageSeen,
    messageConcat,
    emittedToolCalls,
    emittedImages,
    emittedReasoningIds,
    messageReasoningIds,
    toolCallInfoByIndex,
    emittedToolCallsByKey,
  } = state;
  const [type, data] = event.length === 3 ? event.slice(1) : event;

  switch (type) {
    case 'custom': {
      /**
       * Extract custom event type from the data's 'type' field if present.
       * This allows users to emit custom events like:
       *   writer({ type: 'progress', value: 50 })  -> { type: 'data-progress', data: {...} }
       *   writer({ type: 'status', message: '...' }) -> { type: 'data-status', data: {...} }
       *   writer({ key: 'value' })                  -> { type: 'data-custom', data: {...} } (fallback)
       *
       * The 'id' field can be used to make parts persistent and updateable.
       * Parts with an 'id' are NOT transient (added to message.parts).
       * Parts without an 'id' are transient (only passed to onData callback).
       */
      let customTypeName = 'custom';
      let partId: string | undefined;

      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        const dataObj = data as Record<string, unknown>;
        if (typeof dataObj.type === 'string' && dataObj.type) {
          customTypeName = dataObj.type;
        }
        if (typeof dataObj.id === 'string' && dataObj.id) {
          partId = dataObj.id;
        }
      }

      controller.enqueue({
        type: `data-${customTypeName}` as `data-${string}`,
        id: partId,
        transient: partId == null,
        data,
      });
      break;
    }

    case 'messages': {
      const [rawMsg, metadata] = data as [
        BaseMessageChunk | BaseMessage | undefined,
        Record<string, unknown> | undefined,
      ];

      const msg = rawMsg;
      const msgId = getMessageId(msg);

      if (!msgId) return;

      /**
       * Track LangGraph step changes and emit start-step/finish-step events
       */
      const langgraphStep =
        typeof metadata?.langgraph_step === 'number'
          ? metadata.langgraph_step
          : null;
      if (langgraphStep !== null && langgraphStep !== state.currentStep) {
        if (state.currentStep !== null) {
          controller.enqueue({ type: 'finish-step' });
        }
        controller.enqueue({ type: 'start-step' });
        state.currentStep = langgraphStep;
      }

      /**
       * Accumulate message chunks for later reference
       * Note: Only works for actual class instances, not serialized messages
       */
      if (AIMessageChunk.isInstance(msg)) {
        if (messageConcat[msgId]) {
          messageConcat[msgId] = messageConcat[msgId].concat(
            msg,
          ) as AIMessageChunk;
        } else {
          messageConcat[msgId] = msg;
        }
      }

      if (isAIMessageChunk(msg)) {
        const concatChunk = messageConcat[msgId];

        /**
         * Handle image generation outputs from additional_kwargs.tool_outputs
         * Handle both direct properties and serialized messages (kwargs)
         */
        const msgObj = msg as unknown as Record<string, unknown>;
        const dataSource =
          msgObj.type === 'constructor' &&
          msgObj.kwargs &&
          typeof msgObj.kwargs === 'object'
            ? (msgObj.kwargs as Record<string, unknown>)
            : msgObj;
        const additionalKwargs = dataSource.additional_kwargs as
          | Record<string, unknown>
          | undefined;
        const imageOutputs = extractImageOutputs(additionalKwargs);

        for (const imageOutput of imageOutputs) {
          /**
           * Only emit if we have image data and haven't emitted this image yet
           */
          if (imageOutput.result && !emittedImages.has(imageOutput.id)) {
            emittedImages.add(imageOutput.id);

            /**
             * Emit as a file part using proper AI SDK multimodal format
             */
            const mediaType = `image/${imageOutput.output_format || 'png'}`;
            controller.enqueue({
              type: 'file',
              mediaType,
              url: `data:${mediaType};base64,${imageOutput.result}`,
            });
          }
        }

        /**
         * Handle tool call chunks for streaming tool calls
         * Access from dataSource to handle both direct and serialized messages
         *
         * Tool call chunks are streamed as follows:
         * 1. First chunk: has name, id, but often empty args
         * 2. Subsequent chunks: have args but NO id or name
         *
         * We store tool call info by index when we first see it, then look it up
         * for subsequent chunks that don't include the id.
         */
        const toolCallChunks = dataSource.tool_call_chunks as
          | ToolCallChunk[]
          | undefined;
        if (toolCallChunks?.length) {
          for (const toolCallChunk of toolCallChunks) {
            const idx = toolCallChunk.index ?? 0;

            /**
             * If this chunk has an id, store it for future lookups by index
             */
            if (toolCallChunk.id) {
              toolCallInfoByIndex[msgId] ??= {};
              toolCallInfoByIndex[msgId][idx] = {
                id: toolCallChunk.id,
                name:
                  toolCallChunk.name ||
                  concatChunk?.tool_call_chunks?.[idx]?.name ||
                  'unknown',
              };
            }

            /**
             * Get the tool call ID from the chunk, stored info, or accumulated chunks
             */
            const toolCallId =
              toolCallChunk.id ||
              toolCallInfoByIndex[msgId]?.[idx]?.id ||
              concatChunk?.tool_call_chunks?.[idx]?.id;

            /**
             * Skip if we don't have a proper tool call ID - we'll handle it in values
             */
            if (!toolCallId) {
              continue;
            }

            const toolName =
              toolCallChunk.name ||
              toolCallInfoByIndex[msgId]?.[idx]?.name ||
              concatChunk?.tool_call_chunks?.[idx]?.name ||
              'unknown';

            /**
             * Emit tool-input-start when we first see this tool call
             * (even if args is empty - the first chunk often has empty args)
             * Set dynamic: true to enable HITL approval requests
             */
            if (!messageSeen[msgId]?.tool?.[toolCallId]) {
              controller.enqueue({
                type: 'tool-input-start',
                toolCallId: toolCallId,
                toolName: toolName,
                dynamic: true,
              });

              messageSeen[msgId] ??= {};
              messageSeen[msgId].tool ??= {};
              messageSeen[msgId].tool![toolCallId] = true;
              emittedToolCalls.add(toolCallId);
            }

            /**
             * Only emit tool-input-delta when args is non-empty
             */
            if (toolCallChunk.args) {
              controller.enqueue({
                type: 'tool-input-delta',
                toolCallId: toolCallId,
                inputTextDelta: toolCallChunk.args,
              });
            }
          }

          return;
        }

        /**
         * Handle reasoning content from contentBlocks
         * Streaming chunks contain DELTA text (not accumulated), so emit directly.
         * Use reasoning block ID for deduplication as it's consistent across streaming and values events.
         *
         * Important: Early chunks may have reasoning ID but no content, later chunks may
         * have content but no reasoning ID. We capture the ID when first seen and reuse it.
         * We also immediately add to emittedReasoningIds to prevent values events from
         * emitting the same reasoning (values events can arrive between streaming chunks).
         */
        // Capture reasoning ID when we first see it (even if no content yet)
        const chunkReasoningId = extractReasoningId(msg);
        if (chunkReasoningId) {
          if (!messageReasoningIds[msgId]) {
            messageReasoningIds[msgId] = chunkReasoningId;
          }
          // Immediately mark as emitted to prevent values from duplicating
          // This must happen as soon as we see the ID, before content arrives
          emittedReasoningIds.add(chunkReasoningId);
        }

        const reasoning = extractReasoningFromContentBlocks(msg);
        if (reasoning) {
          // Use stored reasoning ID, or current chunk's ID, or fall back to message ID
          const reasoningId =
            messageReasoningIds[msgId] ?? chunkReasoningId ?? msgId;

          if (!messageSeen[msgId]?.reasoning) {
            controller.enqueue({ type: 'reasoning-start', id: msgId });
            messageSeen[msgId] ??= {};
            messageSeen[msgId].reasoning = true;
          }

          // Streaming chunks have delta text, emit directly without slicing
          controller.enqueue({
            type: 'reasoning-delta',
            delta: reasoning,
            id: msgId,
          });
          // Also ensure the reasoning ID is marked (handles case where ID wasn't in first chunk)
          emittedReasoningIds.add(reasoningId);
        }

        /**
         * Handle text content
         */
        const text = getMessageText(msg);
        if (text) {
          if (!messageSeen[msgId]?.text) {
            controller.enqueue({ type: 'text-start', id: msgId });
            messageSeen[msgId] ??= {};
            messageSeen[msgId].text = true;
          }

          controller.enqueue({
            type: 'text-delta',
            delta: text,
            id: msgId,
          });
        }
      } else if (isToolMessageType(msg)) {
        // Handle both direct properties and serialized messages (kwargs)
        const msgObj = msg as unknown as Record<string, unknown>;
        const dataSource =
          msgObj.type === 'constructor' &&
          msgObj.kwargs &&
          typeof msgObj.kwargs === 'object'
            ? (msgObj.kwargs as Record<string, unknown>)
            : msgObj;

        const toolCallId = dataSource.tool_call_id as string | undefined;
        const status = dataSource.status as string | undefined;

        if (toolCallId) {
          if (status === 'error') {
            // Tool execution failed
            controller.enqueue({
              type: 'tool-output-error',
              toolCallId,
              errorText:
                typeof dataSource.content === 'string'
                  ? dataSource.content
                  : 'Tool execution failed',
            });
          } else {
            // Tool execution succeeded
            controller.enqueue({
              type: 'tool-output-available',
              toolCallId,
              output: dataSource.content,
            });
          }
        }
      }

      return;
    }

    case 'values': {
      /**
       * Finalize all pending message chunks
       */
      for (const [id, seen] of Object.entries(messageSeen)) {
        if (seen.text) controller.enqueue({ type: 'text-end', id });
        if (seen.tool) {
          for (const [toolCallId, toolCallSeen] of Object.entries(seen.tool)) {
            const concatMsg = messageConcat[id];
            const toolCall = concatMsg?.tool_calls?.find(
              call => call.id === toolCallId,
            );

            if (toolCallSeen && toolCall) {
              emittedToolCalls.add(toolCallId);
              // Store mapping for HITL interrupt lookup
              const toolCallKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
              emittedToolCallsByKey.set(toolCallKey, toolCallId);
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId,
                toolName: toolCall.name,
                input: toolCall.args,
                dynamic: true,
              });
            }
          }
        }

        if (seen.reasoning) {
          controller.enqueue({ type: 'reasoning-end', id });
        }

        delete messageSeen[id];
        delete messageConcat[id];
        delete messageReasoningIds[id];
      }

      /**
       * Also check for tool calls in the final state that weren't streamed
       * This handles cases where tool calls appear directly in values without being in messages events
       */
      if (data != null && typeof data === 'object' && 'messages' in data) {
        const messages = (data as { messages?: unknown[] }).messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (!msg || typeof msg !== 'object') continue;

            // Use getMessageId to handle both class instances and serialized messages
            const msgId = getMessageId(msg);
            if (!msgId) continue;

            /**
             * Check if this is an AI message with tool calls
             */
            let toolCalls: ToolCall[] | undefined;

            /**
             * For class instances
             */
            if (AIMessageChunk.isInstance(msg) || AIMessage.isInstance(msg)) {
              toolCalls = msg.tool_calls;
            } else if (isPlainMessageObject(msg)) {
              /**
               * For plain objects from RemoteGraph API or serialized LangChain messages
               */
              const obj = msg as Record<string, unknown>;

              /**
               * Determine the data source (handle both direct and serialized formats)
               */
              const isSerializedFormat =
                obj.type === 'constructor' &&
                Array.isArray(obj.id) &&
                ((obj.id as string[]).includes('AIMessageChunk') ||
                  (obj.id as string[]).includes('AIMessage'));
              const dataSource = isSerializedFormat
                ? (obj.kwargs as Record<string, unknown>)
                : obj;

              if (obj.type === 'ai' || isSerializedFormat) {
                /**
                 * Try tool_calls first (normalized format)
                 */
                if (Array.isArray(dataSource?.tool_calls)) {
                  toolCalls = dataSource.tool_calls as ToolCall[];
                } else if (
                  /**
                   * Fall back to additional_kwargs.tool_calls (OpenAI format)
                   */
                  dataSource?.additional_kwargs &&
                  typeof dataSource.additional_kwargs === 'object'
                ) {
                  const additionalKwargs =
                    dataSource.additional_kwargs as Record<string, unknown>;
                  if (Array.isArray(additionalKwargs.tool_calls)) {
                    /**
                     * Convert OpenAI format to normalized format
                     */
                    toolCalls = (
                      additionalKwargs.tool_calls as Array<{
                        id?: string;
                        function?: { name?: string; arguments?: string };
                      }>
                    ).map((tc, idx) => {
                      const functionData = tc.function;
                      let args: unknown;
                      try {
                        args = functionData?.arguments
                          ? JSON.parse(functionData.arguments)
                          : {};
                      } catch {
                        args = {};
                      }
                      return {
                        id: tc.id || `call_${idx}`,
                        name: functionData?.name || 'unknown',
                        args,
                      } as ToolCall;
                    });
                  }
                }
              }
            }

            if (toolCalls && toolCalls.length > 0) {
              for (const toolCall of toolCalls) {
                /**
                 * Only emit if we haven't already processed this tool call
                 */
                if (toolCall.id && !emittedToolCalls.has(toolCall.id)) {
                  emittedToolCalls.add(toolCall.id);
                  // Store mapping for HITL interrupt lookup
                  const toolCallKey = `${toolCall.name}:${JSON.stringify(toolCall.args)}`;
                  emittedToolCallsByKey.set(toolCallKey, toolCall.id);
                  /**
                   * Emit tool-input-start first to ensure proper lifecycle.
                   * Tool calls that weren't streamed (no tool_call_chunks) need
                   * the start event before tool-input-available.
                   */
                  controller.enqueue({
                    type: 'tool-input-start',
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    dynamic: true,
                  });
                  controller.enqueue({
                    type: 'tool-input-available',
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    input: toolCall.args,
                    dynamic: true,
                  });
                }
              }
            }

            /**
             * Check for reasoning content that wasn't streamed
             * Use reasoning block ID for deduplication as it's consistent across streaming and values.
             *
             * IMPORTANT: Handle two cases differently:
             * 1. Message has reasoning WITHOUT tool_calls → emit reasoning (pure reasoning case)
             * 2. Message has reasoning WITH tool_calls → only emit if streamed this request
             *    (When resuming from HITL interrupt, historical messages have both reasoning
             *    AND tool_calls. We skip those to avoid duplicate reasoning entries.)
             */
            const reasoningId = extractReasoningId(msg);
            const wasStreamedThisRequest = !!messageSeen[msgId];
            const hasToolCalls = toolCalls && toolCalls.length > 0;

            /**
             * Determine if we should emit reasoning:
             * - If we already emitted this reasoning ID, skip
             * - If the message was streamed this request, emit (normal flow)
             * - If NOT streamed but has NO tool_calls, emit (pure reasoning in values case)
             * - If NOT streamed but HAS tool_calls, skip (historical HITL message)
             */
            const shouldEmitReasoning =
              reasoningId &&
              !emittedReasoningIds.has(reasoningId) &&
              (wasStreamedThisRequest || !hasToolCalls);

            if (shouldEmitReasoning) {
              /**
               * Use extractReasoningFromValuesMessage which extracts from response_metadata.output
               * This is the full accumulated reasoning, not deltas
               */
              const reasoning = extractReasoningFromValuesMessage(msg);

              if (reasoning) {
                controller.enqueue({ type: 'reasoning-start', id: msgId });
                controller.enqueue({
                  type: 'reasoning-delta',
                  delta: reasoning,
                  id: msgId,
                });
                controller.enqueue({ type: 'reasoning-end', id: msgId });
                emittedReasoningIds.add(reasoningId);
              }
            }
          }
        }
      }

      /**
       * Handle Human-in-the-Loop interrupts
       * When HITL middleware pauses execution, the interrupt data is in __interrupt__
       * Note: This is outside the 'messages' check because interrupt can come as a separate event
       */
      if (data != null && typeof data === 'object') {
        const interrupt = (data as Record<string, unknown>).__interrupt__;
        if (Array.isArray(interrupt) && interrupt.length > 0) {
          for (const interruptItem of interrupt) {
            const interruptValue = (interruptItem as { value?: unknown })
              ?.value as Record<string, unknown> | undefined;

            if (!interruptValue) continue;

            /**
             * Support both camelCase (JS SDK) and snake_case (Python SDK)
             */
            const actionRequests = (interruptValue.actionRequests ||
              interruptValue.action_requests) as
              | Array<{
                  name: string;
                  args?: Record<string, unknown>; // JS SDK uses 'args'
                  arguments?: Record<string, unknown>; // Python SDK uses 'arguments'
                  id?: string;
                }>
              | undefined;

            if (!Array.isArray(actionRequests)) continue;

            for (const actionRequest of actionRequests) {
              const toolName = actionRequest.name;
              /**
               * Support both 'args' (JS SDK) and 'arguments' (Python SDK)
               */
              const input = actionRequest.args || actionRequest.arguments;

              /**
               * Look up the original tool call ID using the name+args key
               * Fall back to action request ID or generate one if not found
               */
              const toolCallKey = `${toolName}:${JSON.stringify(input)}`;
              const toolCallId =
                emittedToolCallsByKey.get(toolCallKey) ||
                actionRequest.id ||
                `hitl-${toolName}-${Date.now()}`;

              /**
               * First emit tool-input-start then tool-input-available
               * so the UI knows what tool is being called with proper lifecycle
               */
              if (!emittedToolCalls.has(toolCallId)) {
                emittedToolCalls.add(toolCallId);
                emittedToolCallsByKey.set(toolCallKey, toolCallId);
                controller.enqueue({
                  type: 'tool-input-start',
                  toolCallId,
                  toolName,
                  dynamic: true,
                });
                controller.enqueue({
                  type: 'tool-input-available',
                  toolCallId,
                  toolName,
                  input,
                  dynamic: true,
                });
              }

              /**
               * Then emit tool-approval-request to mark it as awaiting approval
               */
              controller.enqueue({
                type: 'tool-approval-request',
                approvalId: toolCallId,
                toolCallId,
              });
            }
          }
        }
      }

      break;
    }
  }
}
