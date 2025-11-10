import { openai } from '@ai-sdk/openai';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai/';
import { generateText, type ModelMessage, tool } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

// Minimal reproduction example for GPT-5 invalid tool-call + looped agent
const extractTags = tool({
  inputSchema: z.object({
    tags: z.array(
      z.string().describe('the keywords or tags referenced in the document'),
    ),
    definitions: z
      .record(z.string(), z.string())
      .describe('The definitions that were extracted from the document'),
  }),
  async execute({ tags, definitions }) {
    // Return the provided tags and definitions so the model sees a concrete result.
    return { tags, definitions };
  },
});

async function main() {
  let _messages: ModelMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Always use tools when requested.',
    },
    {
      role: 'user',
      content:
        "Given the following document text, extract the 'tags' and their 'definitions'. Use the extractTags tool.\n\nDocument:\n\"Build a chatbot with React. The chatbot should support streaming and function calling. Also add unit tests and CI.\"\n\nReturn all tags you identify and a definition for each.",
    },
  ];

  for (let i = 0; i < 5; i++) {
    console.log('==================== ITERATION START ====================');
    console.log('Iteration:', i + 1);
    const result = await generateText({
      model: openai('gpt-5'),
      messages: _messages,
      tools: {
        extractTags,
      },
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
          store: false,
        } satisfies OpenAIResponsesProviderOptions,
      },
    });

    console.log('--- RESULT SUMMARY ---');
    console.log('Finish reason:', result.finishReason);
    console.log('Text:', result.text);
    console.log('--- RESULT CONTENT ---');
    console.log('Content parts:', JSON.stringify(result.content, null, 2));

    console.log('--- TOOL CALLS/RESULTS ---');
    console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
    console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));

    console.log('--- REQUEST/RESPONSE ---');
    console.log('Request body:', JSON.stringify(result.request?.body, null, 2));
    console.log(
      'Response body:',
      JSON.stringify(result.response?.body, null, 2),
    );
    console.log(
      'Response messages:',
      JSON.stringify(result.response?.messages, null, 2),
    );

    // Feed model responses back into the next turn (simulating the user's repro loop)
    _messages.push(...(result.response.messages as ModelMessage[]));
    console.log('OUTPUT messages (fed to next turn):');
    console.log(JSON.stringify(_messages, null, 2));
    console.log('==================== ITERATION END ======================');
  }

  console.log();
}

main().catch(console.error);
