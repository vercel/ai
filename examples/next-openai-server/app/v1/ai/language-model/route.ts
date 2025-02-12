import { NextRequest, NextResponse } from 'next/server';
import { modelRegistry } from './model-registry';

// TODO streaming
export async function POST(req: NextRequest) {
  const body = await req.json(); // TODO validation
  const headers = Object.fromEntries(req.headers.entries());

  // TODO auth

  const modelId = headers['ai-language-model-id'];
  if (modelId === null) {
    return NextResponse.json(
      { error: 'Missing "ai-language-model-id" header' },
      { status: 400 },
    );
  }

  // TODO version check

  const originalResponse = await modelRegistry
    .languageModel(modelId)
    .doGenerate(body);

  // TODO removal of some fields for security/privacy,
  // e.g. headers, rawCall, rawResponse, request, response

  return NextResponse.json(originalResponse);
}
