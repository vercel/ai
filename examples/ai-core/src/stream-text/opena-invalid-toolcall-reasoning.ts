import { openai } from '@ai-sdk/openai';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai/';
import { generateText, type ModelMessage, tool } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

// Minimal reproduction example for GPT-5 invalid tool-call + looped agent
const extractTags = tool({
  inputSchema: z.object({
    tags: z.array(z.string().describe(
            'The exact text of the request as it appears in the document, without any additional explanations or definitions. This should be ONLY the request text itself.',
          ),
      )
      .describe('The tags that were extracted from the document'),
    definitions: z
      .record(z.string(), z.string())
      .describe('The definitions that were extracted from the document'),
  }),
});

// Utility: detect whether the model produced any tool calls in its messages
function responseHasToolCalls(messages: ModelMessage[]): boolean {
  return messages.some((m: any) => {
    const content = m?.content;
    if (!Array.isArray(content)) return false;
    return content.some((c: any) => c?.type === 'tool-call');
  });
}

// Utility: simulate invalid tool input by stripping `definitions` from any extractTags tool-call args
function stripDefinitionsFromToolCalls(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.map((m: any) => {
    if (!Array.isArray(m?.content)) return m;
    const newContent = m.content.map((c: any) => {
      if (c?.type === 'tool-call' && c?.toolName === 'extractTags' && c?.args) {
        const newArgs = { ...c.args };
        delete newArgs.definitions; // force invalid input for the tool
        return { ...c, args: newArgs };
      }
      return c;
    });
    return { ...m, content: newContent };
  });
}

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
    const result = await generateText({
      model: openai('gpt-5'),
      messages: _messages,
      tools: {
        extractTags,
      },
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
        } satisfies OpenAIResponsesProviderOptions,
      },
    });

    console.log('Iteration:', i + 1);
    console.log('Finish reason:', result.finishReason);
    console.log('Token usage:', result.usage);
    console.log('Text:', result.text);

    const hadToolCalls = responseHasToolCalls(result.response.messages);

    // Simulate an invalid tool input on responses that include tool calls
    const responseMessages = hadToolCalls
      ? stripDefinitionsFromToolCalls(result.response.messages)
      : result.response.messages;

    // Feed model responses back into the next turn (simulating the user's repro loop)
    _messages.push(...(responseMessages as ModelMessage[]));

    if (!hadToolCalls) {
      console.log('No tool calls in response. Exiting loop.');
      break;
    }
  }

  console.log();
}

main().catch(console.error);
