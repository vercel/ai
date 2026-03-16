import { createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import {
  DynamicToolUIPart,
  readUIMessageStream,
  stepCountIs,
  streamText,
} from 'ai';
import { run } from '../../lib/run';

// Start examples/mcp/src/tool-meta/server.ts in another terminal first.
run(async () => {
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: 'http://localhost:8084/mcp',
    },
  });

  try {
    const tools = await client.tools();

    const result = streamText({
      model: openai('gpt-5-mini'),
      tools,
      stopWhen: stepCountIs(3),
      prompt: 'Use the get-weather tool to tell me the weather in Denver.',
    });

    for await (const uiMessage of readUIMessageStream({
      stream: result.toUIMessageStream(),
    })) {
      const dynamicToolPart = uiMessage.parts.find(
        (part): part is DynamicToolUIPart => part.type === 'dynamic-tool',
      );

      if (dynamicToolPart?._meta != null) {
        console.log('Dynamic tool metadata:');
        console.log(JSON.stringify(dynamicToolPart._meta, null, 2));
      }

      console.log(JSON.stringify(uiMessage, null, 2));
    }
  } finally {
    await client.close();
  }
});
