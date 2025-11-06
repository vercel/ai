import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';
import 'dotenv/config';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'What is on my calendar for today?',
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'google_calendar',
        connectorId: 'connector_googlecalendar',
        authorization: process.env.GOOGLE_TEMP_OAUTH_KEY, // access oauth token by following the steps mentioned [here](https://platform.openai.com/docs/guides/tools-connectors-mcp#authorizing-a-connector)
        serverDescription: 'A connector to access the google calendar',
      }),
    },
  });

  console.dir(result.response.body, { depth: Infinity });
  console.dir(result.toolCalls, { depth: Infinity });
  console.dir(result.toolResults, { depth: Infinity });
  console.log(result.text);
});
