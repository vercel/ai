import { NextRequest, NextResponse } from 'next/server';
import { modelRegistry } from './model-registry';
import { LanguageModelV1StreamPart } from 'ai';

// TODO streaming
export async function POST(req: NextRequest) {
  const body = await req.json(); // TODO validation
  const headers = Object.fromEntries(req.headers.entries());

  // TODO auth
  // TODO version check

  const modelId = headers['ai-language-model-id'];
  if (modelId === null) {
    return NextResponse.json(
      { error: 'Missing "ai-language-model-id" header' },
      { status: 400 },
    );
  }

  const isStreaming = headers['ai-language-model-streaming'] === 'true';

  if (isStreaming) {
    const { stream } = await modelRegistry
      .languageModel(modelId)
      .doStream(body);

    // TODO how to include data that's not streamed but returned by doStream?
    return new NextResponse(
      stream
        .pipeThrough(
          new TransformStream<LanguageModelV1StreamPart, string>({
            transform(chunk, controller) {
              controller.enqueue(`data: ${JSON.stringify(chunk)}` + '\n\n');
            },

            flush(controller) {
              controller.enqueue('DONE\n\n');
            },
          }),
        )
        .pipeThrough(new TextEncoderStream()),
    );
  } else {
    const originalResponse = await modelRegistry
      .languageModel(modelId)
      .doGenerate(body);

    // TODO removal of some fields for security/privacy,
    // e.g. headers, rawCall, rawResponse, request, response

    return NextResponse.json(originalResponse);
  }
}
