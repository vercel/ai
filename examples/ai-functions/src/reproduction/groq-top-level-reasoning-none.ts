import { createGroq, type GroqLanguageModelChatOptions } from '@ai-sdk/groq';
import { generateText } from 'ai';

const modelId = 'qwen/qwen3.6-27b';
const prompt = 'What is 17 times 19? Explain your calculation, then answer.';

async function runCall({
  reasoning,
  groqOptions,
}: {
  reasoning?: 'none';
  groqOptions: GroqLanguageModelChatOptions;
}) {
  let requestBody: Record<string, unknown> | undefined;

  const groq = createGroq({
    fetch: async (url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return fetch(url, init);
    },
  });

  const result = await generateText({
    model: groq(modelId),
    reasoning,
    providerOptions: {
      groq: groqOptions,
    },
    maxOutputTokens: 64,
    prompt,
  });

  return { requestBody, result };
}

async function main() {
  const explicitControl = await runCall({
    groqOptions: {
      reasoningEffort: 'none',
      reasoningFormat: 'parsed',
    },
  });

  if (explicitControl.requestBody?.reasoning_effort !== 'none') {
    throw new Error(
      'Control failed: providerOptions.groq.reasoningEffort was not forwarded.',
    );
  }

  if (explicitControl.result.reasoning.length !== 0) {
    throw new Error(
      'Control failed: Groq returned reasoning after receiving reasoning_effort none.',
    );
  }

  const unified = await runCall({
    reasoning: 'none',
    groqOptions: {
      reasoningFormat: 'parsed',
    },
  });

  if (unified.result.reasoning.length > 0) {
    console.error(
      `ISSUE #19357 REPRODUCED: top-level reasoning 'none' produced ${unified.result.usage.outputTokenDetails.reasoningTokens ?? 'unknown'} reasoning tokens because the Groq request omitted reasoning_effort.`,
    );
    process.exitCode = 1;
    return;
  }

  if (unified.requestBody?.reasoning_effort !== 'none') {
    throw new Error(
      "Groq returned no reasoning for this sample, but the adapter still omitted reasoning_effort for top-level reasoning 'none'.",
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
