import { NextResponse } from 'next/server';
import { generateText, streamText, NoSuchModelError, TextStreamPart } from 'ai';
import { modelRegistry } from './model-registry';

export async function POST(req: Request) {
  console.log('Request', await req.json());
  return NextResponse.json({
    message: 'Hello, world!',
  });
}
