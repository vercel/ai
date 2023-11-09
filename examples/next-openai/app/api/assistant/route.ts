import OpenAI from 'openai';
import { AssistantResponse } from './AssistantResponse';

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

  return AssistantResponse(async ({ sendStatus, sendThreadId }) => {
    // 1. Create a thread if needed
    if (threadId == null) {
      sendStatus({
        status: 'in_progress',
        information: 'Creating a thread...',
      });

      const thread = await openai.beta.threads.create({});
      threadId = thread.id;
      sendThreadId(threadId);
    }

    // 2. Add a message to the thread
    sendStatus({
      status: 'in_progress',
      information: 'Adding a message to the thread...',
    });
    const createdMessage = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message,
    });

    // 3. Run the assistant on the thread
    sendStatus({
      status: 'in_progress',
      information: 'Running the assistant on the thread...',
    });
    let run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: 'asst_CxNzm6Opv96Ku1PBy5yUQ9QJ',
      instructions:
        'Please address the user as Jane Doe. The user has a premium account.',
    });

    // 4. Poll for status change
    while (run.status === 'queued' || run.status === 'in_progress') {
      // delay for 500ms:
      await new Promise(resolve => setTimeout(resolve, 500));

      run = await openai.beta.threads.runs.retrieve(threadId, run.id);
    }

    // 5. Check the run status
    if (
      run.status === 'cancelled' ||
      run.status === 'cancelling' ||
      run.status === 'failed' ||
      run.status === 'expired'
    ) {
      sendStatus({
        status: 'failed',
        information: run.status,
      });
      throw new Error(run.status);
    }

    // 6. Get new thread messages (after our message)
    sendStatus({
      status: 'in_progress',
      information: 'Getting new thread messages...',
    });
    const responseMessages = (
      await openai.beta.threads.messages.list(threadId, {
        after: createdMessage.id,
        order: 'asc',
      })
    ).data;

    console.log(JSON.stringify(responseMessages, null, 2));

    sendStatus({
      status: 'complete',
    });
  });
}
