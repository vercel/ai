import {
  OpenAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from 'ai';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

export async function POST(req: Request) {
  // 0. Parse the request body
  const input: {
    threadId: string | null;
    message: string;
  } = await req.json();

  let threadId = input.threadId;
  const message = input.message;

  // 1. Create a thread
  console.log('Creating a thread...');

  if (threadId == null) {
    const thread = await openai.beta.threads.create({});
    threadId = thread.id;
  }

  // 2. Add a message to the thread
  console.log('Adding a message to the thread...');
  const createdMessage = await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: message,
  });

  // 3. Run the assistant on the thread
  console.log('Running the assistant on the thread...');
  let run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: 'asst_CxNzm6Opv96Ku1PBy5yUQ9QJ',
    instructions:
      'Please address the user as Jane Doe. The user has a premium account.',
  });

  // 4. Poll for status change
  while (run.status === 'queued' || run.status === 'in_progress') {
    // delay for 500ms:
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('Polling for status change...');
    run = await openai.beta.threads.runs.retrieve(threadId, run.id);
  }

  // 5. Check the run status
  if (
    run.status === 'cancelled' ||
    run.status === 'cancelling' ||
    run.status === 'failed' ||
    run.status === 'expired'
  ) {
    console.log('Run failed:', run.status);
    throw new Error(run.status);
  }

  // 6. Get new thread messages (after our message)
  console.log('Getting thread messages...');
  const responseMessages = (
    await openai.beta.threads.messages.list(threadId, {
      after: createdMessage.id,
      order: 'asc',
    })
  ).data;

  console.log(JSON.stringify(responseMessages, null, 2));

  return NextResponse.json({
    threadId,
    messageId: createdMessage.id,
    responseMessages,
  });
}
