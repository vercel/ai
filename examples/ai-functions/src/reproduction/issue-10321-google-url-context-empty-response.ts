import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProviderMetadata,
} from '@ai-sdk/google';
import { generateText } from 'ai';

const modelId = 'gemini-2.5-flash';
const attempts = 20;
const prompt =
  'Based on this context: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai, tell me how to use Gemini with AI SDK.';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function extractProviderText(response: GeminiResponse | undefined) {
  return (
    response?.candidates?.[0]?.content?.parts
      ?.map(part => part.text ?? '')
      .join('') ?? ''
  );
}

async function requestGeminiDirectly(apiKey: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ urlContext: {} }],
      }),
    },
  );

  const body = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(
      `Direct Gemini request failed with HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  const text = extractProviderText(body);
  if (text.trim().length === 0) {
    throw new Error(
      `DIRECT_PROVIDER_EMPTY_RESPONSE: Gemini returned no text: ${JSON.stringify(body)}`,
    );
  }

  console.log(`Direct Gemini response: ${text.length} text characters`);
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (apiKey == null) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required');
  }

  await requestGeminiDirectly(apiKey);

  let latestProviderResponse: GeminiResponse | undefined;
  const google = createGoogleGenerativeAI({
    apiKey,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      latestProviderResponse = (await response
        .clone()
        .json()) as GeminiResponse;
      return response;
    },
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    latestProviderResponse = undefined;

    const result = await generateText({
      model: google(modelId),
      prompt,
      tools: {
        url_context: google.tools.urlContext({}),
      },
    });

    const providerText = extractProviderText(latestProviderResponse);
    const urlContextMetadata = (
      result.providerMetadata?.google as
        | GoogleGenerativeAIProviderMetadata
        | undefined
    )?.urlContextMetadata;

    if (result.text.trim().length === 0) {
      throw new Error(
        `ISSUE_10321_EMPTY_AI_SDK_RESPONSE: attempt ${attempt}; providerTextLength=${providerText.length}; finishReason=${result.finishReason}; urlContextMetadata=${JSON.stringify(urlContextMetadata)}`,
      );
    }

    console.log(
      `AI SDK attempt ${attempt}/${attempts}: ${result.text.length} text characters; provider text preserved=${result.text === providerText}`,
    );
  }

  console.log(
    `ISSUE_10321_NOT_REPRODUCED: direct response and all ${attempts} AI SDK responses contained text.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
