import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  BaseMessage,
  AIMessageChunk,
  BaseMessageChunk,
  ToolCallChunk,
} from '@langchain/core/messages';
import {
  type UIMessageChunk,
  type ToolResultPart,
  type AssistantContent,
  type UserContent,
} from 'ai';

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
  state: { started: boolean; messageId: string },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  /**
   * Get the message ID from the chunk if available
   */
  if (chunk.id) {
    state.messageId = chunk.id;
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
    if (!state.started) {
      controller.enqueue({ type: 'text-start', id: state.messageId });
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
 * Checks if a message is an AI message chunk (works for both class instances and plain objects).
 * For class instances, only AIMessageChunk is matched (not AIMessage).
 * For plain objects from RemoteGraph API, matches type === 'ai'.
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
    return 'type' in obj && obj.type === 'ai';
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
    return 'type' in obj && obj.type === 'tool';
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
  /**
   * Handle plain objects - check content property
   */
  if (msg != null && typeof msg === 'object' && 'content' in msg) {
    const content = (msg as { content: unknown }).content;
    return typeof content === 'string' ? content : '';
  }
  return '';
}

/**
 * Type for image generation tool outputs from LangChain/OpenAI
 */
interface ImageGenerationOutput {
  id: string;
  type: 'image_generation_call';
  status: string;
  result?: string; // base64 image data
  revised_prompt?: string;
  size?: string;
  output_format?: string;
  quality?: string;
  background?: string;
}

/**
 * Checks if an object is an image generation output
 * 
 * @param obj - The object to check.
 * @returns True if the object is an image generation output, false otherwise.
 */
export function isImageGenerationOutput(obj: unknown): obj is ImageGenerationOutput {
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
  state: {
    messageSeen: Record<
      string,
      { text?: boolean; reasoning?: boolean; tool?: Record<string, boolean> }
    >;
    messageConcat: Record<string, AIMessageChunk>;
    emittedToolCalls: Set<string>;
    emittedImages: Set<string>;
  },
  controller: ReadableStreamDefaultController<UIMessageChunk>,
): void {
  const { messageSeen, messageConcat, emittedToolCalls, emittedImages } = state;
  const [type, data] = event.length === 3 ? event.slice(1) : event;

  switch (type) {
    case 'custom': {
      controller.enqueue({
        type: `data-${type}` as 'data-custom',
        transient: true,
        data,
      });
      break;
    }

    case 'messages': {
      const [rawMsg] = data as [BaseMessageChunk | BaseMessage | undefined];

      const msg = rawMsg;

      if (!msg?.id) return;

      /**
       * Accumulate message chunks for later reference
       */
      if (messageConcat[msg.id]) {
        const existing = messageConcat[msg.id];
        if (AIMessageChunk.isInstance(msg)) {
          messageConcat[msg.id] = existing.concat(msg) as AIMessageChunk;
        }
      } else if (AIMessageChunk.isInstance(msg)) {
        messageConcat[msg.id] = msg;
      }

      if (isAIMessageChunk(msg)) {
        const concatChunk = messageConcat[msg.id];

        /**
         * Handle image generation outputs from additional_kwargs.tool_outputs
         */
        const additionalKwargs = (
          msg as { additional_kwargs?: Record<string, unknown> }
        ).additional_kwargs;
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
         */
        const toolCallChunks = (msg as { tool_call_chunks?: ToolCallChunk[] })
          .tool_call_chunks;
        if (toolCallChunks?.length) {
          for (const toolCallChunk of toolCallChunks) {
            const idx = toolCallChunk.index ?? 0;
            /**
             * Get the tool call ID from the chunk or accumulated chunks
             */
            const toolCallId =
              toolCallChunk.id || concatChunk?.tool_call_chunks?.[idx]?.id;

            /**
             * Skip if we don't have a proper tool call ID - we'll handle it in values
             */
            if (!toolCallId) {
              continue;
            }

            const toolName =
              toolCallChunk.name ||
              concatChunk?.tool_call_chunks?.[idx]?.name ||
              `unknown`;

            if (toolCallChunk.args) {
              if (!messageSeen[msg.id]?.tool?.[toolCallId]) {
                controller.enqueue({
                  type: 'tool-input-start',
                  toolCallId: toolCallId,
                  toolName: toolName,
                });

                messageSeen[msg.id] ??= {};
                messageSeen[msg.id].tool ??= {};
                messageSeen[msg.id].tool![toolCallId] = true;
                emittedToolCalls.add(toolCallId);
              }

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
         * Handle text content
         */
        const text = getMessageText(msg);
        if (text) {
          if (!messageSeen[msg.id]?.text) {
            controller.enqueue({ type: 'text-start', id: msg.id });
            messageSeen[msg.id] ??= {};
            messageSeen[msg.id].text = true;
          }

          controller.enqueue({
            type: 'text-delta',
            delta: text,
            id: msg.id,
          });
        }
      } else if (isToolMessageType(msg)) {
        const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
        if (toolCallId) {
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId,
            output: (msg as { content?: unknown }).content,
          });
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
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId,
                toolName: toolCall.name,
                input: toolCall.args,
              });
            }
          }
        }

        if (seen.reasoning) controller.enqueue({ type: 'reasoning-end', id });

        delete messageSeen[id];
        delete messageConcat[id];
      }

      /**
       * Also check for tool calls in the final state that weren't streamed
       * This handles cases where tool calls appear directly in values without being in messages events
       */
      if (data != null && typeof data === 'object' && 'messages' in data) {
        const messages = (data as { messages?: unknown[] }).messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (!msg || typeof msg !== 'object' || !('id' in msg)) continue;

            const msgId = (msg as { id: string }).id;
            if (!msgId) continue;

            /**
             * Check if this is an AI message with tool calls
             */
            let toolCalls:
              | Array<{ id: string; name: string; args: unknown }>
              | undefined;

            /**
             * For class instances
             */
            if (AIMessageChunk.isInstance(msg) || AIMessage.isInstance(msg)) {
              toolCalls = (
                msg as {
                  tool_calls?: Array<{
                    id: string;
                    name: string;
                    args: unknown;
                  }>;
                }
              ).tool_calls;
            }
            /**
             * For plain objects from RemoteGraph API
             */
            else if (isPlainMessageObject(msg)) {
              const obj = msg as Record<string, unknown>;
              if (obj.type === 'ai') {
                /**
                 * Try tool_calls first (normalized format)
                 */
                if (Array.isArray(obj.tool_calls)) {
                  toolCalls = obj.tool_calls as {
                    id: string;
                    name: string;
                    args: unknown;
                  }[];
                }
                /**
                 * Fall back to additional_kwargs.tool_calls (OpenAI format)
                 */
                else if (
                  obj.additional_kwargs &&
                  typeof obj.additional_kwargs === 'object'
                ) {
                  const additionalKwargs = obj.additional_kwargs as Record<
                    string,
                    unknown
                  >;
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
                      };
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
                if (!emittedToolCalls.has(toolCall.id)) {
                  emittedToolCalls.add(toolCall.id);
                  controller.enqueue({
                    type: 'tool-input-available',
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    input: toolCall.args,
                  });
                }
              }
            }
          }
        }
      }

      break;
    }
  }
}
