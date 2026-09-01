import type { ImageModelV4 } from '@ai-sdk/provider';
import { generateImage, NoImageGeneratedError } from 'ai';

const failureSignal =
  'ISSUE_20153_REPRODUCED: NoImageGeneratedError discarded GenerateImageCall diagnostics';

type RetainedCall = {
  images?: unknown[];
  providerMetadata?: {
    google?: {
      images?: unknown[];
      promptFeedback?: {
        blockReason?: string;
      };
    };
  };
  response?: {
    timestamp?: Date;
    modelId?: string;
    headers?: Record<string, string>;
  };
  warnings?: Array<{ type?: string; message?: string }>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

async function main() {
  const timestamp = new Date('2026-09-01T00:00:00.000Z');
  const providerMetadata = {
    google: {
      images: [],
      promptFeedback: {
        blockReason: 'SAFETY',
      },
    },
  };
  const warnings = [{ type: 'other' as const, message: 'sentinel warning' }];
  const usage = {
    inputTokens: 7,
    outputTokens: 0,
    totalTokens: 7,
  };

  const model: ImageModelV4 = {
    specificationVersion: 'v4',
    provider: 'google',
    modelId: 'mock-google-image-model',
    maxImagesPerCall: 1,
    async doGenerate() {
      return {
        images: [],
        providerMetadata,
        warnings,
        usage,
        response: {
          timestamp,
          modelId: 'mock-google-image-model',
          headers: { 'x-reproduction': 'issue-20153' },
        },
      };
    },
  };

  try {
    await generateImage({
      model,
      prompt: 'test prompt',
      maxRetries: 0,
    });
  } catch (error) {
    if (!NoImageGeneratedError.isInstance(error)) {
      throw error;
    }

    const calls = (error as NoImageGeneratedError & { calls?: unknown }).calls;
    const call = Array.isArray(calls)
      ? (calls[0] as RetainedCall | undefined)
      : undefined;

    if (
      !Array.isArray(calls) ||
      calls.length !== 1 ||
      !call ||
      call.images?.length !== 0 ||
      call.providerMetadata?.google?.images?.length !== 0 ||
      call.providerMetadata?.google?.promptFeedback?.blockReason !== 'SAFETY' ||
      call.warnings?.length !== 1 ||
      call.warnings[0]?.type !== 'other' ||
      call.warnings[0]?.message !== 'sentinel warning' ||
      call.usage?.inputTokens !== 7 ||
      call.usage?.outputTokens !== 0 ||
      call.usage?.totalTokens !== 7 ||
      call.response?.timestamp?.getTime() !== timestamp.getTime() ||
      call.response?.modelId !== 'mock-google-image-model' ||
      call.response?.headers?.['x-reproduction'] !== 'issue-20153'
    ) {
      throw new Error(failureSignal);
    }

    console.log(
      'NoImageGeneratedError retained provider metadata, warnings, usage, and response diagnostics.',
    );
    return;
  }

  throw new Error('Expected generateImage to throw NoImageGeneratedError.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
