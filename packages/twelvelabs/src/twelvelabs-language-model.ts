import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  NoContentGeneratedError,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { TwelveLabs } from 'twelvelabs-js';
import {
  convertToTwelveLabsPrompt,
  TwelveLabsPromptData,
} from './convert-to-twelvelabs-prompt';
import { mapTwelveLabsError } from './twelvelabs-error';
import {
  TwelveLabsModelId,
  TwelveLabsProviderMetadata,
} from './twelvelabs-settings';

export interface TwelveLabsLanguageModelSettings {
  client: TwelveLabs;
  indexId: string;
  modelId: TwelveLabsModelId;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export class TwelveLabsLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'twelvelabs' as const;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsImageUrls = false;
  readonly supportsObjectGeneration = false;
  readonly supportsToolCalls = false;
  readonly supportsToolMessages = false;
  readonly supportsStructuredOutputs = false;
  readonly supportsStreaming = true;

  get supportedUrls() {
    return {
      'video/*': [/.*/],
      'video/mp4': [/.*/],
      'video/avi': [/.*/],
      'video/mov': [/.*/],
      'video/quicktime': [/.*/],
      'video/webm': [/.*/],
      'video/x-msvideo': [/.*/],
    };
  }

  private readonly client: TwelveLabs;
  private readonly indexId: string;

  constructor(
    public readonly modelId: TwelveLabsModelId,
    settings: TwelveLabsLanguageModelSettings,
  ) {
    this.client = settings.client;
    this.indexId = settings.indexId;
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    warnings: LanguageModelV2CallWarning[];
    providerMetadata?: SharedV2ProviderMetadata;
    request?: { body?: unknown };
    response?: { headers?: Record<string, string>; body?: unknown };
  }> {
    try {
      const promptData = convertToTwelveLabsPrompt(options.prompt);

      // Get video ID and track metadata
      const startTime = Date.now();
      const { videoId, metadata } = await this.prepareVideo(promptData);

      if (!videoId) {
        throw new Error(
          'No video content provided. Please include a video file or reference in your message.',
        );
      }

      // Perform video analysis
      const analyzeResult = await this.client.analyze({
        videoId,
        prompt: promptData.prompt,
      });

      const result = analyzeResult.data || '';

      if (!result) {
        throw new NoContentGeneratedError();
      }

      // Build provider metadata
      const providerMetadata: TwelveLabsProviderMetadata = {
        ...metadata,
        videoId,
        indexId: this.indexId,
        processingTime: Date.now() - startTime,
      };

      return {
        content: [{ type: 'text', text: result }],
        finishReason: 'stop',
        usage: {
          inputTokens: promptData.prompt.split(' ').length,
          outputTokens: result.split(' ').length,
          totalTokens:
            promptData.prompt.split(' ').length + result.split(' ').length,
        },
        request: {
          body: {
            prompt: promptData.prompt,
            videoId,
            indexId: this.indexId,
            temperature: options.temperature,
          },
        },
        warnings: [],
        providerMetadata: {
          twelvelabs: providerMetadata as any,
        },
      };
    } catch (error) {
      throw mapTwelveLabsError(error);
    }
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    request?: { body?: unknown };
    response?: { headers?: Record<string, string> };
  }> {
    try {
      const promptData = convertToTwelveLabsPrompt(options.prompt);

      // Get video ID and track metadata
      const startTime = Date.now();
      const { videoId, metadata } = await this.prepareVideo(promptData);

      if (!videoId) {
        throw new Error(
          'No video content provided. Please include a video file or reference in your message.',
        );
      }

      // Create streaming response
      const textStream = await this.client.analyzeStream({
        videoId,
        prompt: promptData.prompt,
      });

      let fullText = '';
      let isFirstChunk = true;
      const warnings: LanguageModelV2CallWarning[] = [];
      const providerMetadata: SharedV2ProviderMetadata = {
        twelvelabs: {
          ...metadata,
          videoId,
          indexId: this.indexId,
          processingTime: 0, // Will be updated
        } as any,
      };

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          try {
            // Send stream-start event with warnings
            controller.enqueue({ type: 'stream-start', warnings });

            // Start text streaming
            controller.enqueue({ type: 'text-start', id: '0' });

            for await (const chunk of textStream) {
              // Check if chunk is a string first (to avoid 'in' operator error)
              if (typeof chunk === 'string') {
                fullText += chunk;
                controller.enqueue({
                  type: 'text-delta',
                  id: '0',
                  delta: chunk,
                });
              } else if (
                chunk &&
                typeof chunk === 'object' &&
                'text' in chunk &&
                chunk.text
              ) {
                // Check if chunk has text property (based on SDK)
                fullText += chunk.text;
                controller.enqueue({
                  type: 'text-delta',
                  id: '0',
                  delta: chunk.text,
                });
              }
            }

            // End text streaming
            controller.enqueue({ type: 'text-end', id: '0' });

            (providerMetadata.twelvelabs as any).processingTime =
              Date.now() - startTime;

            if (!fullText) {
              throw new NoContentGeneratedError();
            }

            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                inputTokens: promptData.prompt.split(' ').length,
                outputTokens: fullText.split(' ').length,
                totalTokens:
                  promptData.prompt.split(' ').length +
                  fullText.split(' ').length,
              },
              providerMetadata,
            });

            controller.close();
          } catch (error) {
            controller.error(mapTwelveLabsError(error));
          }
        },
      });

      return {
        stream,
        request: {
          body: {
            prompt: promptData.prompt,
            videoId,
            indexId: this.indexId,
            temperature: options.temperature,
          },
        },
      };
    } catch (error) {
      throw mapTwelveLabsError(error);
    }
  }

  private async prepareVideo(promptData: TwelveLabsPromptData): Promise<{
    videoId: string | undefined;
    metadata: Partial<TwelveLabsProviderMetadata>;
  }> {
    if (!promptData.videoInfo) {
      return { videoId: undefined, metadata: {} };
    }

    const { videoInfo } = promptData;

    // Use existing video ID if provided
    if (videoInfo.videoId) {
      return {
        videoId: videoInfo.videoId,
        metadata: { newVideoUploaded: false },
      };
    }

    // Upload new video from URL
    if (videoInfo.videoUrl) {
      const task = await this.client.tasks.create({
        indexId: this.indexId,
        videoUrl: videoInfo.videoUrl,
      });

      const completedTask = await this.client.tasks.waitForDone(
        (task as any).id || (task as any)._id,
        {
          sleepInterval: 5,
        },
      );

      return {
        videoId: completedTask.videoId,
        metadata: {
          newVideoUploaded: true,
        },
      };
    }

    if (videoInfo.videoData) {
      const videoBlob = new Blob([videoInfo.videoData], {
        type: videoInfo.mediaType || 'video/mp4',
      });

      const task = await this.client.tasks.create({
        indexId: this.indexId,
        videoFile: videoBlob,
      });

      const completedTask = await this.client.tasks.waitForDone(
        (task as any).id || (task as any)._id,
        {
          sleepInterval: 5,
        },
      );

      return {
        videoId: completedTask.videoId,
        metadata: {
          newVideoUploaded: true,
        },
      };
    }

    return { videoId: undefined, metadata: {} };
  }
}
