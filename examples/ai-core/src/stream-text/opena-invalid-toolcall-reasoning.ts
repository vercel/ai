import { openai } from "@ai-sdk/openai";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai/";
import { streamText, type ModelMessage, type Tool } from "ai";
import "dotenv/config";

// Minimal reproduction example for GPT-5-mini streamText configuration
async function main() {
  const messages: ModelMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    {
      role: "user",
      content: "How are you?",
    },
  ];
  let iterations = 0;
  while (iterations < 3) {
    iterations++;
    const result = streamText({
      // Model configuration
      model: openai("gpt-5"),

      // Messages array (your messages here)
      messages,

      tools: {
        web_search_preview: openai.tools.webSearch({}) as Tool<{}, unknown>,
      },
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
        } satisfies OpenAIResponsesProviderOptions,
      },
      onError: (error) => {
        console.error("============ HERE COMES THE ERROR ==========================");
        console.error("Error:", error);
        console.error("================ STATE OF MESSAGES ==========================");
        console.dir(messages, { depth: null });
        console.error("============ HERE FINISHES THE ERROR ==========================");
      },
      onFinish: (event) => {
        messages.push(...event.response.messages);
        console.log('Request body:', JSON.stringify(event.request.body, null, 2));
        console.log('Message body:', JSON.stringify(messages, null, 2));
      },
    });

    console.log("Iteration:", iterations);
    console.log("Token usage:", await result.usage);
    console.log("Finish reason:", await result.finishReason);
    console.log("Result:", await result.text);
    messages.push({
      role: "user",
      content: "Can you find one news article about React (js framework) and return the headline?",
    });
  }

  console.log();
}

main().catch(console.error);