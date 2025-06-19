'use server';

import { generateId } from 'ai';
import { createStreamableUI, createStreamableValue } from 'ai/rsc';
import { OpenAI } from 'openai';
import { ReactNode } from 'react';
import { searchEmails } from './function';
import { Message } from './message';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export interface ClientMessage {
  id: string;
  status: ReactNode;
  text: ReactNode;
  gui: ReactNode;
}

const ASSISTANT_ID = 'asst_xxxx';
let THREAD_ID = '';
let RUN_ID = '';

export async function submitMessage(question: string): Promise<ClientMessage> {
  const status = createStreamableUI('thread.init');
  const textStream = createStreamableValue('');
  const textUIStream = createStreamableUI(
    <Message textStream={textStream.value} />,
  );
  const gui = createStreamableUI();

  const runQueue = [];

  (async () => {
    if (THREAD_ID) {
      await openai.beta.threads.messages.create(THREAD_ID, {
        role: 'user',
        content: question,
      });

      const run = await openai.beta.threads.runs.create(THREAD_ID, {
        assistant_id: ASSISTANT_ID,
        stream: true,
      });

      runQueue.push({ id: generateId(), run });
    } else {
      const run = await openai.beta.threads.createAndRun({
        assistant_id: ASSISTANT_ID,
        stream: true,
        thread: {
          messages: [{ role: 'user', content: question }],
        },
      });

      runQueue.push({ id: generateId(), run });
    }

    while (runQueue.length > 0) {
      const latestRun = runQueue.shift();

      if (latestRun) {
        for await (const delta of latestRun.run) {
          const { data, event } = delta;

          status.update(event);

          if (event === 'thread.created') {
            THREAD_ID = data.id;
          } else if (event === 'thread.run.created') {
            RUN_ID = data.id;
          } else if (event === 'thread.message.delta') {
            data.delta.content?.map((part: any) => {
              if (part.type === 'text') {
                if (part.text) {
                  textStream.append(part.text.value);
                }
              }
            });
          } else if (event === 'thread.run.requires_action') {
            if (data.required_action) {
              if (data.required_action.type === 'submit_tool_outputs') {
                const { tool_calls } = data.required_action.submit_tool_outputs;
                const tool_outputs = [];

                for (const tool_call of tool_calls) {
                  const { id: toolCallId, function: fn } = tool_call;
                  const { name, arguments: args } = fn;

                  if (name === 'search_emails') {
                    const { query, has_attachments } = JSON.parse(args);

                    gui.append(
                      <div className="flex flex-row items-center gap-2">
                        <div>
                          Searching for emails: {query}, has_attachments:
                          {has_attachments ? 'true' : 'false'}
                        </div>
                      </div>,
                    );

                    await new Promise(resolve => setTimeout(resolve, 2000));

                    const fakeEmails = searchEmails({ query, has_attachments });

                    gui.append(
                      <div className="flex flex-col gap-2">
                        {fakeEmails.map(email => (
                          <div
                            key={email.id}
                            className="flex flex-row items-center justify-between gap-2 p-2 rounded-md bg-zinc-100"
                          >
                            <div className="flex flex-row items-center gap-2">
                              <div>{email.subject}</div>
                            </div>
                            <div className="text-zinc-500">{email.date}</div>
                          </div>
                        ))}
                      </div>,
                    );

                    tool_outputs.push({
                      tool_call_id: toolCallId,
                      output: JSON.stringify(fakeEmails),
                    });
                  }
                }

                const nextRun: any =
                  await openai.beta.threads.runs.submitToolOutputs(
                    THREAD_ID,
                    RUN_ID,
                    {
                      tool_outputs,
                      stream: true,
                    },
                  );

                runQueue.push({ id: generateId(), run: nextRun });
              }
            }
          } else if (event === 'thread.run.failed') {
            console.log(data);
          }
        }
      }
    }

    status.done();
    textUIStream.done();
    gui.done();
  })();

  return {
    id: generateId(),
    status: status.value,
    text: textUIStream.value,
    gui: gui.value,
  };
}
