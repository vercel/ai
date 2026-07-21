import { readFile } from 'node:fs/promises';
import type {
  LanguageModelV3Prompt,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  convertToGoogleGenerativeAIMessages,
  SKIP_THOUGHT_SIGNATURE_VALIDATOR,
} from '../../../../packages/google/src/convert-to-google-generative-ai-messages';

const failureSignal =
  'Issue #16298 reproduced: valid parallel Gemini 3 tool calls triggered the skip_thought_signature_validator warning.';

type Fixture = {
  prompt: string;
  warnings: SharedV3Warning[];
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    providerMetadata: SharedV3ProviderMetadata | null;
  }>;
};

function readThoughtSignature(
  providerMetadata: SharedV3ProviderMetadata | null,
): string | undefined {
  for (const namespace of ['google', 'vertex', 'googleVertex']) {
    const thoughtSignature = providerMetadata?.[namespace]?.thoughtSignature;
    if (typeof thoughtSignature === 'string') {
      return thoughtSignature;
    }
  }
}

async function main() {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/google/src/__fixtures__/issue-16298-gemini3-parallel-tool-calls.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Fixture;

  if (
    readThoughtSignature(fixture.toolCalls[0].providerMetadata) == null ||
    readThoughtSignature(fixture.toolCalls[1].providerMetadata) != null
  ) {
    throw new Error(
      'Recorded provider fixture does not contain the documented signed-first, unsigned-second parallel call shape.',
    );
  }

  const prompt: LanguageModelV3Prompt = [
    {
      role: 'user',
      content: [{ type: 'text', text: fixture.prompt }],
    },
    {
      role: 'assistant',
      content: fixture.toolCalls.map(call => ({
        type: 'tool-call' as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
        providerOptions: call.providerMetadata ?? undefined,
      })),
    },
  ];
  const warnings: SharedV3Warning[] = [];
  const converted = convertToGoogleGenerativeAIMessages(prompt, {
    isGemini3Model: true,
    providerOptionsName: 'googleVertex',
    onWarning: warning => warnings.push(warning),
  });

  const hasWarning = warnings.some(
    warning =>
      warning.type === 'other' &&
      warning.message.includes(SKIP_THOUGHT_SIGNATURE_VALIDATOR) &&
      warning.message.includes('application code that drops'),
  );
  const hasInjectedSentinel = converted.contents[1].parts.some(
    part =>
      'thoughtSignature' in part &&
      part.thoughtSignature === SKIP_THOUGHT_SIGNATURE_VALIDATOR,
  );

  console.log(
    JSON.stringify(
      {
        recordedWarnings: fixture.warnings,
        replayWarnings: warnings,
        convertedToolCallParts: converted.contents[1].parts,
        hasMisleadingWarning: hasWarning,
        hasInjectedSentinel,
      },
      null,
      2,
    ),
  );

  if (hasWarning && hasInjectedSentinel) {
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
