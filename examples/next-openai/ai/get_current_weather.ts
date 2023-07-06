"use server";
import { ChatRequest, Message, nanoid } from "ai";
import { ChatCompletionRequestMessageFunctionCall } from "openai-edge";

export default async function getCurrentWeather(
  chatMessages: Message[],
  functionCall: ChatCompletionRequestMessageFunctionCall
): Promise<ChatRequest> {
  if (functionCall.arguments) {
    const parsedFunctionCallArguments = JSON.parse(functionCall.arguments);
    // You now have access to the parsed arguments here (assuming the JSON was valid)
    // If JSON is invalid, return an appropriate message to the model so that it may retry?
    console.log(parsedFunctionCallArguments);
  }

  // Generate a fake temperature
  const temperature = Math.floor(Math.random() * (100 - 30 + 1) + 30);
  // Generate random weather condition
  const weather = ["sunny", "cloudy", "rainy", "snowy"][
    Math.floor(Math.random() * 4)
  ];

  const functionResponse: ChatRequest = {
    messages: [
      ...chatMessages,
      {
        id: nanoid(),
        name: "get_current_weather",
        role: "function" as const,
        content: JSON.stringify({
          temperature,
          weather,
          info: "This data is randomly generated and came from a fake weather API!",
        }),
      },
    ],
  };
  return functionResponse;
}
