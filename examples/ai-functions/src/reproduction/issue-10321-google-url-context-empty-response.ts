import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { generateText as generateTextReported } from 'ai-reported';
import { createGoogleGenerativeAI as createGoogleReported } from 'google-reported';

const modelId = 'gemini-2.5-flash';
const prompt = `Based on the document: https://ai.google.dev/gemini-api/docs/url-context#limitations.
Answer this question: How many URLs can the URL context tool process in one request?`;
const requestBody = {
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  tools: [{ urlContext: {} }],
};
const attempts = 3;
const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
};

function responseText(response: GeminiResponse): string {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map(part => part.text ?? '')
      .join('') ?? ''
  );
}

async function readGeminiResponse(response: Response): Promise<GeminiResponse> {
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Gemini request failed with HTTP ${response.status}: ${body}`,
    );
  }

  return JSON.parse(body) as GeminiResponse;
}

async function main() {
  const directResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key':
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? 'missing-api-key',
      },
      body: JSON.stringify(requestBody),
    },
  );
  const directBody = await readGeminiResponse(directResponse);
  const directText = responseText(directBody);

  console.log(
    `direct: textLength=${directText.length} finishReason=${directBody.candidates?.[0]?.finishReason ?? 'missing'}`,
  );

  if (directText.trim().length === 0) {
    throw new Error('ISSUE_10321_PROVIDER_EMPTY_RESPONSE');
  }

  let rawReportedResponse: GeminiResponse | undefined;
  const reportedGoogle = createGoogleReported({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      rawReportedResponse = await readGeminiResponse(response.clone());
      return response;
    },
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    rawReportedResponse = undefined;

    const result = await generateTextReported({
      model: reportedGoogle(modelId),
      prompt,
      maxRetries: 5,
      tools: {
        url_context: reportedGoogle.tools.urlContext({}),
      },
    });
    const rawText = responseText(rawReportedResponse ?? {});

    console.log(
      `reported ${attempt}/${attempts}: textLength=${result.text.length} rawTextLength=${rawText.length} finishReason=${result.finishReason}`,
    );

    if (result.text.trim().length === 0) {
      throw new Error(
        rawText.trim().length === 0
          ? 'ISSUE_10321_PROVIDER_EMPTY_RESPONSE'
          : 'ISSUE_10321_REPORTED_AI_SDK_EMPTY_RESPONSE',
      );
    }

    await delay(1_000);
  }

  let rawCurrentResponse: GeminiResponse | undefined;
  const currentGoogle = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      rawCurrentResponse = await readGeminiResponse(response.clone());
      return response;
    },
  });

  for (let attempt = 1; attempt <= attempts; attempt++) {
    rawCurrentResponse = undefined;

    const result = await generateText({
      model: currentGoogle(modelId),
      prompt,
      maxRetries: 5,
      tools: {
        url_context: currentGoogle.tools.urlContext({}),
      },
    });
    const rawText = responseText(rawCurrentResponse ?? {});

    console.log(
      `current ${attempt}/${attempts}: textLength=${result.text.length} rawTextLength=${rawText.length} finishReason=${result.finishReason}`,
    );

    if (result.text.trim().length === 0) {
      throw new Error(
        rawText.trim().length === 0
          ? 'ISSUE_10321_PROVIDER_EMPTY_RESPONSE'
          : 'ISSUE_10321_CURRENT_AI_SDK_EMPTY_RESPONSE',
      );
    }

    await delay(1_000);
  }

  console.log('ISSUE_10321_NOT_REPRODUCED');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
