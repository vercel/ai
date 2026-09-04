import { openai } from '@ai-sdk/openai';
import { getErrorMessage } from '@ai-sdk/provider-utils';
import {
  experimental_streamTranslate as streamTranslate,
  generateSpeech,
} from 'ai';
import type { TranslationEvent } from '@/app/stream-translate/openai/translation-event';

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    text?: unknown;
    targetLanguage?: unknown;
  };

  if (
    typeof body.text !== 'string' ||
    body.text.trim().length === 0 ||
    typeof body.targetLanguage !== 'string' ||
    body.targetLanguage.trim().length === 0
  ) {
    return new Response('Text and target language are required.', {
      status: 400,
    });
  }

  const text = body.text;
  const targetLanguage = body.targetLanguage;
  const abortController = new AbortController();
  if (request.signal.aborted) {
    abortController.abort(request.signal.reason);
  } else {
    request.signal.addEventListener(
      'abort',
      () => abortController.abort(request.signal.reason),
      { once: true },
    );
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: TranslationEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        // OpenAI's translation model accepts raw 24kHz PCM audio. Generate a
        // deterministic input so the entire flow can be exercised without
        // microphone permissions or browser-side resampling.
        const speech = await generateSpeech({
          model: openai.speech('tts-1'),
          text,
          outputFormat: 'pcm',
          abortSignal: abortController.signal,
        });

        const result = streamTranslate({
          model: openai.translation('gpt-realtime-translate'),
          audio: createAudioStream(speech.audio.uint8Array),
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          targetLanguage,
          abortSignal: abortController.signal,
        });

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'source-transcript-delta':
              enqueue({ type: part.type, delta: part.delta });
              break;
            case 'source-transcript-partial':
            case 'source-transcript-final':
              enqueue({ type: part.type, text: part.text });
              break;
            case 'output-text-delta':
              enqueue({ type: part.type, delta: part.delta });
              break;
            case 'audio':
              enqueue({
                type: part.type,
                audio:
                  typeof part.audio === 'string'
                    ? part.audio
                    : Buffer.from(part.audio).toString('base64'),
              });
              break;
            case 'error':
              enqueue({
                type: part.type,
                message: getErrorMessage(part.error),
                fatal: false,
              });
              break;
            case 'output-text-final':
            case 'raw':
              break;
          }
        }

        const [
          sourceText,
          translationText,
          durationInSeconds,
          usage,
          warnings,
        ] = await Promise.all([
          result.sourceText,
          result.translationText,
          result.durationInSeconds,
          result.usage,
          result.warnings,
        ]);

        enqueue({
          type: 'finish',
          sourceText,
          translationText,
          durationInSeconds,
          usage,
          warnings,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          enqueue({
            type: 'error',
            message: getErrorMessage(error),
            fatal: true,
          });
        }
      } finally {
        controller.close();
      }
    },
    cancel(reason) {
      abortController.abort(reason);
    },
  });

  return new Response(responseStream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/x-ndjson',
    },
  });
}

function createAudioStream(bytes: Uint8Array) {
  const chunkSize = 16 * 1024;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
}
