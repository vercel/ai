import OpenAI from 'openai';
import { AssistantResponse } from '../assistant/AssistantResponse';
import { MessageContentText } from 'openai/resources/beta/threads/messages/messages';

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge';

const homeTemperatures = {
  bedroom: 20,
  'home office': 21,
  'living room': 21,
  kitchen: 22,
  bathroom: 23,
};

export async function POST(req: Request) {
  // 0. Parse the request body
  const input: {
    threadId: string | null;
    message: string;
  } = await req.json();

  let threadId = input.threadId;
  const message = input.message;

  return AssistantResponse(
    async ({ sendStatus, sendThreadId, sendMessage, sendData }) => {
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
      const createdMessage = await openai.beta.threads.messages.create(
        threadId,
        {
          role: 'user',
          content: message,
        },
      );

      // 3. Run the assistant on the thread
      sendStatus({
        status: 'in_progress',
        information: 'Running the assistant on the thread...',
      });
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: 'asst_1wdVNBWkyIHZ6TBoZTpFOZYs',
      });

      async function waitForRun(run: OpenAI.Beta.Threads.Runs.Run) {
        // Poll for status change
        while (run.status === 'queued' || run.status === 'in_progress') {
          // delay for 500ms:
          await new Promise(resolve => setTimeout(resolve, 500));

          run = await openai.beta.threads.runs.retrieve(threadId!, run.id);
        }

        // Check the run status
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

        if (run.status === 'requires_action') {
          if (run.required_action?.type === 'submit_tool_outputs') {
            // TODO support loops (e.g. when the run request more information in a 2nd and 3rd round)
            // TODO support several tool calls in parallel (e.g. temperature for all rooms)
            const toolCall =
              run.required_action.submit_tool_outputs.tool_calls[0];

            if (toolCall.function.name === 'getRoomTemperature') {
              const parameters = JSON.parse(toolCall.function.arguments);
              const temperature =
                homeTemperatures[
                  parameters.room as keyof typeof homeTemperatures
                ];

              run = await openai.beta.threads.runs.submitToolOutputs(
                threadId!,
                run.id,
                {
                  tool_outputs: [
                    {
                      tool_call_id: toolCall.id,
                      output: temperature.toString(),
                    },
                  ],
                },
              );

              await waitForRun(run);
            } else if (toolCall.function.name === 'setRoomTemperature') {
              const parameters = JSON.parse(toolCall.function.arguments);
              const temperature = parameters.temperature;

              homeTemperatures[
                parameters.room as keyof typeof homeTemperatures
              ] = temperature;

              run = await openai.beta.threads.runs.submitToolOutputs(
                threadId!,
                run.id,
                {
                  tool_outputs: [
                    {
                      tool_call_id: toolCall.id,
                      output: `New temperature ${temperature} degrees celcius set.`,
                    },
                  ],
                },
              );

              await waitForRun(run);
            } else if (toolCall.function.name === 'showRoomTemperatureToUser') {
              const parameters = JSON.parse(toolCall.function.arguments);
              const temperature = parameters.temperature;
              const unit = parameters.unit;
              const room = parameters.room;

              sendData({
                type: 'roomTemperature',
                room,
                temperature,
                unit,
              });

              run = await openai.beta.threads.runs.submitToolOutputs(
                threadId!,
                run.id,
                {
                  tool_outputs: [
                    {
                      tool_call_id: toolCall.id,
                      output: `The temperature information is shown to the user.`,
                    },
                  ],
                },
              );

              await waitForRun(run);
            }
          }
        }

        // console.log(run);
        // sendStatus({
        //   status: 'requires_action',
        //   data: {
        //     type: 'confirmation',
        //     message: 'Do you want to purchase this painting?',
        //   },
        // });
        // return;
      }

      await waitForRun(run);

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

      // 7. Send the messages
      for (const message of responseMessages) {
        sendMessage({
          id: message.id,
          role: 'assistant',
          // TODO add image support
          content: message.content.filter(
            content => content.type === 'text',
          ) as Array<MessageContentText>,
        });
      }

      sendStatus({
        status: 'complete',
      });
    },
  );
}
