import { AssistantResponse } from 'ai';
import OpenAI from 'openai';

type AssistantRequest = {
  threadId: string | null;
  message: string;
};

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export default defineLazyEventHandler(async () => {
  // Validate the OpenAI API key and Assistant ID are set
  const apiKey = useRuntimeConfig().openaiApiKey;
  if (!apiKey)
    throw new Error('Missing OpenAI API key, `NUXT_OPEN_API_KEY` not set');

  const assistantId = useRuntimeConfig().assistantId;
  if (!assistantId)
    throw new Error('Missing Assistant ID, `NUXT_ASSISTANT_ID` not set');

  // Create an OpenAI API client (that's edge friendly!)
  const openai = new OpenAI({ apiKey });

  const homeTemperatures = {
    bedroom: 20,
    'home office': 21,
    'living room': 21,
    kitchen: 22,
    bathroom: 23,
  };

  return defineEventHandler(async (event: any) => {
    const { threadId: userThreadId, message }: AssistantRequest =
      await readBody(event);

    // Extract the signal from the H3 request if available
    const signal = event?.web?.request?.signal;

    // Create a thread if needed
    const threadId = userThreadId ?? (await openai.beta.threads.create({})).id;

    // Add a message to the thread
    const createdMessage = await openai.beta.threads.messages.create(
      threadId,
      {
        role: 'user',
        content: message,
      },
      { signal },
    );

    return AssistantResponse(
      { threadId, messageId: createdMessage.id },
      async ({ forwardStream, sendDataMessage }) => {
        // Run the assistant on the thread
        const runStream = openai.beta.threads.runs.stream(
          threadId,
          { assistant_id: assistantId },
          { signal },
        );

        // forward run status would stream message deltas
        let runResult = await forwardStream(runStream);

        // status can be: queued, in_progress, requires_action, cancelling, cancelled, failed, completed, or expired
        while (
          runResult?.status === 'requires_action' &&
          runResult?.required_action?.type === 'submit_tool_outputs'
        ) {
          // Process the required action to submit tool outputs
          const tool_outputs =
            runResult.required_action.submit_tool_outputs.tool_calls.map(
              (toolCall: any) => {
                const parameters = JSON.parse(toolCall.function.arguments);

                switch (toolCall.function.name) {
                  case 'getRoomTemperature': {
                    const room: keyof typeof homeTemperatures = parameters.room;
                    const temperature = homeTemperatures[room];

                    return {
                      tool_call_id: toolCall.id,
                      output: temperature.toString(),
                    };
                  }

                  case 'setRoomTemperature': {
                    const room: keyof typeof homeTemperatures = parameters.room;
                    const oldTemperature = homeTemperatures[room];

                    homeTemperatures[room] = parameters.temperature;

                    sendDataMessage({
                      role: 'data',
                      data: {
                        oldTemperature,
                        newTemperature: parameters.temperature,
                        description: `Temperature in the ${room} changed from ${oldTemperature} to ${parameters.temperature}`,
                      },
                    });

                    return {
                      tool_call_id: toolCall.id,
                      output: 'Temperature set successfully',
                    };
                  }
                  default: {
                    throw new Error(
                      `Unknown tool call function: ${toolCall.function.name}`,
                    );
                  }
                }
              },
            );

          // Submit the tool outputs
          runResult = await forwardStream(
            openai.beta.threads.runs.submitToolOutputsStream(
              threadId,
              runResult.id,
              { tool_outputs },
              { signal },
            ),
          );
        }
      },
    );
  });
});
