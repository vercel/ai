import { streamObject } from "ai";
import { notificationSchema } from "../../structured-object/schema.js";
import { OPENAI_API_KEY } from "$env/static/private";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function POST({ request }) {
  const context = await request.json();

  const result = streamObject({
    model: openai("gpt-4o"),
    schema: notificationSchema,
    prompt:
      `Generate 3 notifications for a messages app in this context:` + context,
    onError: (error) => {
      console.error(error);
    },
  });

  return result.toTextStreamResponse();
}
