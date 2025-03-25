import { InvalidArgumentError } from '@ai-sdk/provider';
import { delay as originalDelay } from '@ai-sdk/provider-utils';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

const CHUNKING_REGEXPS = {
  word: /\s*\S+\s+/m,
  line: /[^\n]*\n/m,
};

/**
 * Smooths text streaming output.
 *
 * @param delayInMs - The delay in milliseconds between each chunk. Defaults to 10ms. Can be set to `null` to skip the delay.
 * @param chunking - Controls how the text is chunked for streaming. Use "word" to stream word by word (default), "line" to stream line by line, or provide a custom RegExp pattern for custom chunking.
 *
 * @returns A transform stream that smooths text streaming output.
 */
export function smoothStream<TOOLS extends ToolSet>({
  delayInMs = 10,
  chunking = 'word',
  _internal: { delay = originalDelay } = {},
}: {
  delayInMs?: number | null;
  chunking?: 'word' | 'line' | RegExp;
  /**
   * Internal. For test use only. May change without notice.
   */
  _internal?: {
    delay?: (delayInMs: number | null) => Promise<void>;
  };
} = {}): (options: {
  tools: TOOLS;
}) => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const chunkingRegexp =
    typeof chunking === 'string' ? CHUNKING_REGEXPS[chunking] : chunking;

  if (chunkingRegexp == null) {
    throw new InvalidArgumentError({
      argument: 'chunking',
      message: `Chunking must be "word" or "line" or a RegExp. Received: ${chunking}`,
    });
  }

  return () => {
    // Separate buffers for text and tool call args
    let textBuffer = '';
    let toolCallBuffer: { id: string; name: string; buffer: string } | null =
      null;

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        // Handle special cases that should flush buffers and pass through
        if (
          chunk.type === 'step-finish' ||
          chunk.type === 'tool-result' ||
          chunk.type === 'tool-call'
        ) {
          // Flush text buffer if any
          if (textBuffer.length > 0) {
            controller.enqueue({ type: 'text-delta', textDelta: textBuffer });
            textBuffer = '';
          }

          // For tool-call states (call/result), clear the buffer without sending an extra delta
          // This prevents an extra partial-call from appearing between call and result states
          if (chunk.type === 'tool-call') {
            // Just clear the buffer without sending anything
            toolCallBuffer = null;
          }
          // For other cases, flush the buffer normally
          else if (toolCallBuffer && toolCallBuffer.buffer.length > 0) {
            controller.enqueue({
              type: 'tool-call-delta',
              toolCallId: toolCallBuffer.id,
              toolName: toolCallBuffer.name,
              argsTextDelta: toolCallBuffer.buffer,
            });
            toolCallBuffer = null;
          }

          controller.enqueue(chunk);
          return;
        }

        // Pass through any non-streaming chunks
        if (chunk.type !== 'text-delta' && chunk.type !== 'tool-call-delta') {
          controller.enqueue(chunk);
          return;
        }

        // Handle text-delta chunks
        if (chunk.type === 'text-delta') {
          textBuffer += chunk.textDelta;

          let match;
          while ((match = chunkingRegexp.exec(textBuffer)) != null) {
            const chunkText = match[0];
            controller.enqueue({ type: 'text-delta', textDelta: chunkText });
            textBuffer = textBuffer.slice(chunkText.length);

            await delay(delayInMs);
          }
          return;
        }

        // Handle tool-call-delta chunks
        if (chunk.type === 'tool-call-delta') {
          // Initialize tool call buffer if needed
          if (!toolCallBuffer || toolCallBuffer.id !== chunk.toolCallId) {
            toolCallBuffer = {
              id: chunk.toolCallId,
              name: chunk.toolName,
              buffer: '',
            };
          }

          // Add new content to buffer
          toolCallBuffer.buffer += chunk.argsTextDelta;

          // Process buffer chunks
          let match;
          while ((match = chunkingRegexp.exec(toolCallBuffer.buffer)) != null) {
            const chunkText = match[0];
            controller.enqueue({
              type: 'tool-call-delta',
              toolCallId: toolCallBuffer.id,
              toolName: toolCallBuffer.name,
              argsTextDelta: chunkText,
            });
            toolCallBuffer.buffer = toolCallBuffer.buffer.slice(
              chunkText.length,
            );

            await delay(delayInMs);
          }
          return;
        }
      },
      flush(controller) {
        // Flush any remaining content in the text buffer
        if (textBuffer.length > 0) {
          controller.enqueue({ type: 'text-delta', textDelta: textBuffer });
        }

        // Flush any remaining content in the tool call buffer
        if (toolCallBuffer && toolCallBuffer.buffer.length > 0) {
          controller.enqueue({
            type: 'tool-call-delta',
            toolCallId: toolCallBuffer.id,
            toolName: toolCallBuffer.name,
            argsTextDelta: toolCallBuffer.buffer,
          });
        }
      },
    });
  };
}
