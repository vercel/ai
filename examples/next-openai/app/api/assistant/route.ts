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
  const { messages, threadId } = await req.json();

  // 1. Create a thread
  console.log('Creating a thread...');
  const thread = await openai.beta.threads.create({});

  // 2. Add a message to the thread
  console.log('Adding a message to the thread...');
  const message = await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: 'I need to solve the equation `3x + 11 = 14`. Can you help me?',
  });

  // 3. Run the assistant on the thread
  console.log('Running the assistant on the thread...');
  let run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: 'asst_CxNzm6Opv96Ku1PBy5yUQ9QJ',
    instructions:
      'Please address the user as Jane Doe. The user has a premium account.',
  });

  // 4. Poll for status change
  console.log('Polling for status change...');
  while (run.status === 'queued' || run.status === 'in_progress') {
    // delay for 500ms:
    await new Promise(resolve => setTimeout(resolve, 500));

    run = await openai.beta.threads.runs.retrieve(thread.id, run.id);
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
  const responseMsgs = await openai.beta.threads.messages.list(thread.id, {
    after: message.id,
  });

  // TODO identify the new messages - an assistant might add more than 1 message

  console.log(JSON.stringify(responseMsgs, null, 2));

  return NextResponse.json({
    hello: 'world',
  });
}
