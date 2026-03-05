import { TranscriptionModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { CambaiConfig } from './cambai-config';
import { cambaiFailedResponseHandler } from './cambai-error';
import { CambaiTranscriptionModelId } from './cambai-transcription-options';

const POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const cambaiTranscriptionModelOptionsSchema = z.object({
  language: z.number().nullish().default(1),
  wordLevelTimestamps: z.boolean().nullish().default(false),
  timeoutMs: z.number().nullish(),
});

export type CambaiTranscriptionModelOptions = z.infer<
  typeof cambaiTranscriptionModelOptionsSchema
>;

interface CambaiTranscriptionModelConfig extends CambaiConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class CambaiTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: CambaiTranscriptionModelId,
    private readonly config: CambaiTranscriptionModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<TranscriptionModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { audio, mediaType, providerOptions, abortSignal, headers } = options;
    const warnings: SharedV3Warning[] = [];

    const cambaiOptions = await parseProviderOptions({
      provider: 'cambai',
      providerOptions,
      schema: cambaiTranscriptionModelOptionsSchema,
    });

    const languageCode = cambaiOptions?.language ?? 1;
    const wordLevelTimestamps = cambaiOptions?.wordLevelTimestamps ?? false;
    const timeoutMs = cambaiOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Step 1: Create transcription task
    const formData = new FormData();
    formData.append('language', String(languageCode));

    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      'media_file',
      new File([blob], `audio.${fileExtension}`, { type: mediaType }),
    );

    const combinedHeaders = combineHeaders(this.config.headers(), headers);

    const { value: createResponse } = await postFormDataToApi({
      url: this.config.url({
        path: '/transcribe',
        modelId: this.modelId,
      }),
      headers: combinedHeaders,
      formData,
      failedResponseHandler: cambaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cambaiCreateTranscriptionResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    const taskId = createResponse.task_id;
    if (!taskId) {
      throw new Error('Camb.ai transcription did not return a task_id');
    }

    // Step 2: Poll for task completion
    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (abortSignal?.aborted) {
        throw new DOMException('Transcription aborted', 'AbortError');
      }

      const statusResponse = await fetch(
        this.config.url({
          path: `/transcribe/${encodeURIComponent(taskId)}`,
          modelId: this.modelId,
        }),
        {
          method: 'GET',
          headers: combinedHeaders as Record<string, string>,
          signal: abortSignal,
        },
      );

      if (!statusResponse.ok) {
        throw new Error(
          `Transcription status check failed: ${statusResponse.status}`,
        );
      }

      const status = (await statusResponse.json()) as {
        status: string;
        message?: string;
        run_id?: number;
      };

      if (status.status === 'SUCCESS') {
        const runId = status.run_id;
        if (runId == null) {
          throw new Error(
            'Camb.ai transcription succeeded but did not return a run_id',
          );
        }

        // Step 3: Fetch results
        const queryParams = new URLSearchParams();
        if (wordLevelTimestamps) {
          queryParams.set('word_level_timestamps', 'true');
        }

        const resultUrl = `${this.config.url({
          path: `/transcription-result/${encodeURIComponent(runId)}`,
          modelId: this.modelId,
        })}?${queryParams.toString()}`;

        const resultResponse = await fetch(resultUrl, {
          method: 'GET',
          headers: combinedHeaders as Record<string, string>,
          signal: abortSignal,
        });

        if (!resultResponse.ok) {
          throw new Error(
            `Transcription result fetch failed: ${resultResponse.status}`,
          );
        }

        const transcript = (await resultResponse.json()) as Array<{
          text: string;
          start: number;
          end: number;
          speaker: string;
        }>;

        const text = transcript.map(s => s.text).join(' ');
        const segments = transcript.map(s => ({
          text: s.text,
          startSecond: s.start,
          endSecond: s.end,
        }));
        const durationInSeconds =
          transcript.length > 0
            ? transcript[transcript.length - 1].end
            : undefined;

        return {
          text,
          segments,
          language: undefined,
          durationInSeconds,
          warnings,
          response: {
            timestamp: currentDate,
            modelId: this.modelId,
          },
        };
      }

      if (status.status === 'ERROR') {
        const message =
          typeof status.message === 'string'
            ? status.message
            : JSON.stringify(status.message);
        throw new Error(`Transcription failed: ${message}`);
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Transcription timed out after ${timeoutMs}ms (task_id: ${taskId})`,
        );
      }

      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Transcription aborted', 'AbortError'));
        };
        const timer = setTimeout(() => {
          abortSignal?.removeEventListener('abort', onAbort);
          resolve();
        }, POLL_INTERVAL_MS);
        abortSignal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
}

const cambaiCreateTranscriptionResponseSchema = z.object({
  task_id: z.string(),
});
