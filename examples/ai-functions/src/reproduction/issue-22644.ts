import type {
  Experimental_SpeechTranslationModelV4 as SpeechTranslationModelV4,
  Experimental_SpeechTranslationModelV4StreamPart as SpeechTranslationStreamPart,
  Experimental_TranscriptionModelV4StreamPart as TranscriptionStreamPart,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  experimental_streamTranscribe as streamTranscribe,
  experimental_streamTranslate as streamTranslate,
} from 'ai';

const inputAudioFormat = { type: 'audio/pcm' as const, rate: 24_000 };

function audioStream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

function streamOf<T>(parts: T[]) {
  return new ReadableStream<T>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

function transcriptionModel(
  parts: TranscriptionStreamPart[],
): TranscriptionModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    async doGenerate() {
      throw new Error('Not used by this streaming reproduction.');
    },
    async doStream() {
      return { stream: streamOf(parts) };
    },
  };
}

function translationModel(
  parts: SpeechTranslationStreamPart[],
): SpeechTranslationModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    async doStream() {
      return { stream: streamOf(parts) };
    },
  };
}

function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: undefined, message: undefined, cause: undefined };
  }
  return {
    name: error.name,
    message: error.message,
    cause: error.cause,
  };
}

async function captureRejection(value: PromiseLike<unknown>) {
  try {
    await value;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the result promise to reject.');
}

async function assertFullStreamPreservesProviderError({
  name,
  providerError,
  create,
}: {
  name: string;
  providerError: Error;
  create: () => AsyncIterable<{ type: string; error?: unknown }>;
}) {
  const chunks: Array<{ type: string; error?: unknown }> = [];
  try {
    for await (const chunk of create()) {
      chunks.push(chunk);
    }
  } catch {
    // Error plus EOF ends with the typed empty-result error. The streamed error
    // part must still have been observable before that terminal failure.
  }

  if (chunks[0]?.type !== 'error' || chunks[0].error !== providerError) {
    throw new Error(`${name} fullStream did not preserve the provider error.`);
  }
}

async function assertCleanEmptyKeepsTypedErrors() {
  const transcriptError = await captureRejection(
    streamTranscribe({
      model: transcriptionModel([]),
      audio: audioStream(),
      inputAudioFormat,
    }).text,
  );
  const translationError = await captureRejection(
    streamTranslate({
      model: translationModel([]),
      audio: audioStream(),
      inputAudioFormat,
      targetLanguage: 'en',
    }).translationText,
  );

  if (
    errorDetails(transcriptError).name !== 'AI_NoTranscriptGeneratedError' ||
    errorDetails(translationError).name !== 'AI_NoTranslationGeneratedError'
  ) {
    throw new Error(
      'Clean empty EOF did not retain typed empty-result errors.',
    );
  }
}

async function assertSuccessfulFinishStillWinsAfterRecoverableError() {
  const recoverableError = new Error('Synthetic recoverable provider warning');
  const transcription = streamTranscribe({
    model: transcriptionModel([
      { type: 'error', error: recoverableError },
      { type: 'finish', text: 'Hello', segments: [] },
    ]),
    audio: audioStream(),
    inputAudioFormat,
  });
  const translation = streamTranslate({
    model: translationModel([
      { type: 'error', error: recoverableError },
      { type: 'finish', sourceText: 'Hello', outputText: 'Hola' },
    ]),
    audio: audioStream(),
    inputAudioFormat,
    targetLanguage: 'es',
  });

  if (
    (await transcription.text) !== 'Hello' ||
    (await translation.translationText) !== 'Hola'
  ) {
    throw new Error('A successful finish did not resolve result promises.');
  }
}

async function main() {
  await assertCleanEmptyKeepsTypedErrors();
  await assertSuccessfulFinishStillWinsAfterRecoverableError();

  const providerError = new Error('Synthetic provider quota exceeded');

  await assertFullStreamPreservesProviderError({
    name: 'transcription',
    providerError,
    create: () =>
      streamTranscribe({
        model: transcriptionModel([{ type: 'error', error: providerError }]),
        audio: audioStream(),
        inputAudioFormat,
      }).fullStream,
  });
  await assertFullStreamPreservesProviderError({
    name: 'translation',
    providerError,
    create: () =>
      streamTranslate({
        model: translationModel([{ type: 'error', error: providerError }]),
        audio: audioStream(),
        inputAudioFormat,
        targetLanguage: 'en',
      }).fullStream,
  });

  const transcriptError = await captureRejection(
    streamTranscribe({
      model: transcriptionModel([{ type: 'error', error: providerError }]),
      audio: audioStream(),
      inputAudioFormat,
    }).text,
  );
  const translationError = await captureRejection(
    streamTranslate({
      model: translationModel([{ type: 'error', error: providerError }]),
      audio: audioStream(),
      inputAudioFormat,
      targetLanguage: 'en',
    }).translationText,
  );

  const outcomes = [
    {
      ...errorDetails(transcriptError),
      resultPromise: 'transcription.text',
      preservesProviderError:
        transcriptError === providerError ||
        errorDetails(transcriptError).cause === providerError,
    },
    {
      ...errorDetails(translationError),
      resultPromise: 'translation.translationText',
      preservesProviderError:
        translationError === providerError ||
        errorDetails(translationError).cause === providerError,
    },
  ];

  console.log(
    JSON.stringify(
      outcomes.map(({ cause, ...outcome }) => ({
        ...outcome,
        causeMessage: cause instanceof Error ? cause.message : undefined,
      })),
      null,
      2,
    ),
  );

  const lostErrors = outcomes
    .filter(outcome => !outcome.preservesProviderError)
    .map(outcome => outcome.resultPromise);

  if (lostErrors.length > 0) {
    throw new Error(
      `Issue #22644 reproduced: result promises discarded provider error causes for ${lostErrors.join(
        ' and ',
      )}.`,
    );
  }
}

await main();
