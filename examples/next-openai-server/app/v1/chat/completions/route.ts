import { NextResponse } from 'next/server';
import { CreateChatCompletionRequest } from './openai-request-schema';
import { generateText, NoSuchModelError } from 'ai';
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

    // If valid, extract the typed data
    const requestBody = parseResult.data;
    if (requestBody.stream) {
      // Return a JSON response with "hello world" and echo the validated body
      return NextResponse.json({
        message: 'hello world - streaming not supported',
        body: requestBody,
      });
    } else {
      const result = await generateText({
        model: modelRegistry.languageModel(requestBody.model),
        messages: requestBody.messages as any, // TODO mapping
      });

      return NextResponse.json({
        object: 'chat.completion',
        id: result.response.id,
        created: result.response.timestamp.getTime(),
        model: result.response.modelId,
        // TODO system fingerprint
        // TODO service tier
        choices: [
          // TODO multiple choice support
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.text,
            },
            // TODO logprobs
            finish_reason: result.finishReason, // TODO mapping
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

  console.log('req', req);
  return NextResponse.json({ message: 'OpenAI-compatible response' });
}
