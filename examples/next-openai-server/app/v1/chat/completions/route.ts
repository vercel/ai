import { NextResponse } from 'next/server';
import { CreateChatCompletionRequest } from './openai-request-schema';
import { generateText, streamText, NoSuchModelError, TextStreamPart } from 'ai';
import { modelRegistry } from './model-registry';

export async function POST(req: Request) {
  try {
    // Parse the request body as JSON
    const rawRequestBody = await req.json();

    // Validate the request body with the Zod schema
    const parseResult = CreateChatCompletionRequest.safeParse(rawRequestBody);
    if (!parseResult.success) {
      console.error('Validation errors:', parseResult.error.issues);
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request schema',
            details: parseResult.error.issues,
          },
        },
        { status: 400 },
      );
    }

    // Extract the validated body
    const requestBody = parseResult.data;

    if (requestBody.stream) {
      // Call streamText using the model from the registry.
      // You might join requestBody.messages into a prompt if needed.
      const result = streamText({
        model: modelRegistry.languageModel(requestBody.model),
        messages: requestBody.messages as any, // TODO: add proper mapping if needed
      });

      // Use a TransformStream to map fullStream chunks into SSE messages.
      let finishEmitted = false;
      const sseTransform = new TransformStream<
        TextStreamPart<any>, // TODO fix any
        Uint8Array
      >({
        transform(chunk, controller) {
          // Handle different event types from the full stream
          if (chunk.type === 'text-delta' || chunk.type === 'reasoning') {
            const sseChunk = {
              id: 'chatcmpl-' + Math.random().toString(36).substring(2, 15),
              object: 'chat.completion.chunk',
              created: Date.now(),
              model: requestBody.model,
              choices: [
                {
                  delta: { content: chunk.textDelta },
                  index: 0,
                  finish_reason: null,
                },
              ],
            };
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(sseChunk)}\n\n`),
            );
          } else if (chunk.type === 'finish') {
            // When receiving a finished event, output a complete chunk
            // that omits delta but includes finish_reason and usage.
            if (!finishEmitted) {
              finishEmitted = true;
              const finishChunk = {
                id: 'chatcmpl-' + Math.random().toString(36).substring(2, 15),
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: requestBody.model,
                choices: [
                  {
                    // No delta is sent on the finish chunk.
                    delta: {},
                    index: 0,
                    finish_reason: chunk.finishReason,
                  },
                ],
                // We assume the chunk carries usage info; fallback to empty object if not present.
                usage: chunk.usage ?? {},
              };
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify(finishChunk)}\n\n`,
                ),
              );
            }
          } else if (chunk.type === 'error') {
            // For error events, send an SSE error message and terminate the stream.
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ error: chunk.error })}\n\n`,
              ),
            );
            controller.terminate();
          }
          // Ignore other event types (tool-call, step-start, etc)
        },
        flush(controller) {
          if (!finishEmitted) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          }
        },
      });

      // Pipe the fullStream (which is an AsyncIterableStream) through the transformer.
      const sseStream = result.fullStream.pipeThrough(sseTransform);

      return new NextResponse(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    } else {
      // Non-streaming response – call generateText normally
      const result = await generateText({
        model: modelRegistry.languageModel(requestBody.model),
        messages: requestBody.messages as any, // TODO: add proper mapping if needed
      });

      return NextResponse.json({
        object: 'chat.completion',
        id: result.response.id,
        created: result.response.timestamp.getTime(),
        model: result.response.modelId,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.text,
            },
            finish_reason: result.finishReason,
          },
        ],
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          total_tokens: result.usage.totalTokens,
        },
      });
    }
  } catch (error) {
    if (NoSuchModelError.isInstance(error)) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: 400 },
      );
    }

    console.error('Error parsing request:', error);
    return NextResponse.json(
      { error: { message: 'Invalid JSON' } },
      { status: 400 },
    );
  }
}
