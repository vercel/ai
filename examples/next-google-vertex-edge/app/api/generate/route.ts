export const runtime = "edge";

import { generateText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateAuthTokenEdgeCompatible } from "@/lib/google-vertex-auth-edge";

export async function GET() {
  const vertex = createVertex({
    experimental_getHeadersAsync: async () => ({
      //   foo: "bar",
      Authorization: `Bearer ${await generateAuthTokenEdgeCompatible()}`,
    }),
  });
  const model = vertex("gemini-1.5-flash");
  const { text } = await generateText({
    model,
    prompt: "tell me a story",
  });
  return Response.json({ message: text });
}

// import { generateText } from "ai";
// import { createVertex } from "@ai-sdk/google-vertex";
// import { generateAuthTokenEdgeCompatible } from "@/lib/google-vertex-auth-edge";

// const vertex = createVertex({
//   experimental_getHeadersAsync: async () => ({
//     Authorization: `Bearer ${await generateAuthTokenEdgeCompatible()}`,
//   }),
// });

// const model = vertex("gemini-1.5-flash", {
//   safetySettings: [
//     {
//       category: "HARM_CATEGORY_DANGEROUS_CONTENT",
//       threshold: "BLOCK_ONLY_HIGH",
//     },
//     { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
//     { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
//     {
//       category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
//       threshold: "BLOCK_ONLY_HIGH",
//     },
//   ],
// });

// const generatedPhrases = new Set<string>();

// export async function GET() {
//   try {
//     const previousPhrases = Array.from(generatedPhrases).join(", ");
//     const updatedPrompt = `
//       Generate a short, impactful phrase in the style of Bruce Nauman's neon artworks.
//       The phrase should be two words connected by "AND", like "LIVE AND DIE" or "SING AND SCREAM".
//       Make it related to something that happened on this day, hour, and minute to the extent possible in past history, but abstract and philosophical.
//       Return only the phrase in capital letters, nothing else.
//       Avoid using the following phrases: ${previousPhrases}.
//     `;

//     console.log("Generating phrase...");
//     const { text } = await generateText({
//       model,
//       prompt: updatedPrompt,
//       // temperature: 0.9,
//       // maxTokens: 10,
//     });

//     const trimmedText = text.trim();
//     generatedPhrases.add(trimmedText);

//     return Response.json({ phrase: trimmedText });
//   } catch (error) {
//     console.error("API Error:", {
//       name: (error as Error).name,
//       message: (error as Error).message,
//       stack: (error as Error).stack,
//       cause: (error as Error).cause,
//     });
//     return Response.json(
//       { error: "Failed to generate phrase" },
//       { status: 500 }
//     );
//   }
// }
