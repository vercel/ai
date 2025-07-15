import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  LanguageModelV2TextPart,
  LanguageModelV2ResponseMetadata,
  SharedV2Headers,
} from '@ai-sdk/provider';
import { CactusChatSettings } from './cactus-provider';
import {
  CactusLM,
  CompletionParams,
  NativeCompletionResult,
  CactusOAICompatibleMessage,
} from 'cactus-react-native';

import RNFS from 'react-native-fs';


const ModelCache = {
  _cache: new Map<string, { localPath: string }>(),
  getLocalPath(url: string): string {
    const filename =
      url.split('/').pop()?.replace(/[^a-zA-Z0-9.-]/g, '_') ?? 'model.gguf';
    return `${RNFS.DocumentDirectoryPath}/${filename}`;
  },
  async isDownloaded(url: string): Promise<boolean> {
    if (this._cache.has(url)) return true; // in-session cache
    const localPath = this.getLocalPath(url);
    const exists = await RNFS.exists(localPath); // check filesystem
    if (exists) {
      this.add(url, localPath);
      return true;
    }
    return false;
  },
  add(url: string, localPath: string) {
    this._cache.set(url, { localPath });
  },
  list(): Array<{ url: string; localPath: string }> {
    return Array.from(ModelCache._cache.entries()).map(
      ([url, data]: [string, { localPath: string }]) => ({
        url,
        ...data,
      }),
    );
  },
};

export enum ModelStatus {
  IDLE,
  DOWNLOADING,
  INITIALIZING,
  READY,
  ERROR,
}

export interface CactusChatLanguageModelConfig {
  provider: string;
  generateId?: () => string;
}

export class CactusChatLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider: string;
  readonly modelId: string;
  readonly modelUrl: string;

  private lm: CactusLM | null = null;
  private status: ModelStatus = ModelStatus.IDLE;
  private lastError: Error | null = null;
  private conversationHistory: CactusOAICompatibleMessage[] = [];

  constructor(
    modelUrl: string,
    private readonly settings: CactusChatSettings,
    private readonly config: CactusChatLanguageModelConfig,
  ) {
    this.modelUrl = modelUrl;
    // modelId is the model file path used in CactusLM.init().
    // We use modelId because it's a required parameter in LanguageModelV2.
    this.modelId = ModelCache.getLocalPath(this.modelUrl);
    this.provider = config.provider; // 'cactus'
  }

  public getStatus(): ModelStatus {
    return this.status;
  }

  public getLastError(): Error | null {
    return this.lastError; // useful for debugging when this.status is ModelStatus.ERROR
  }

  static async listDownloadedModels() {
    return ModelCache.list();
  }

  private async adaptMessagesToStatefulContext(
    fullPrompt: CactusOAICompatibleMessage[],
  ): Promise<CactusOAICompatibleMessage[]> {
    let divergent = fullPrompt.length < this.conversationHistory.length;
    if (!divergent) {
      for (let i = 0; i < this.conversationHistory.length; i++) {
        // Using JSON.stringify for a concise deep comparison.
        if (JSON.stringify(this.conversationHistory[i]) !== JSON.stringify(fullPrompt[i])) {
          divergent = true;
          break;
        }
      }
    }

    if (divergent) {
      await this.lm!.rewind();
      this.conversationHistory = [];
      return fullPrompt;
    } else {
      return fullPrompt.slice(this.conversationHistory.length);
    }
  }

  async downloadModel(
    options: { onProgress?: (p: number) => void } = {},
  ): Promise<string> {
    this.status = ModelStatus.DOWNLOADING;
    try {
      await RNFS.downloadFile({
        fromUrl: this.modelUrl,
        toFile: this.modelId,
        progress: (res: { bytesWritten: number; contentLength: number }) =>
          options.onProgress?.(res.bytesWritten / res.contentLength),
      }).promise;

      ModelCache.add(this.modelUrl, this.modelId);
      this.status = ModelStatus.IDLE;
      return this.modelId;
    } catch (e) {
      this.lastError = e as Error;
      this.status = ModelStatus.ERROR;
      throw e;
    }
  }

  async initialize(): Promise<void> {
    if (this.status === ModelStatus.READY) return;
    if (this.status === ModelStatus.INITIALIZING) return;
    const isDownloaded = await ModelCache.isDownloaded(this.modelUrl);
    if (!isDownloaded) {
      throw new Error('Model not downloaded. Call downloadModel() first.');
    }

    this.status = ModelStatus.INITIALIZING;
    try {
      const { lm, error } = await CactusLM.init({ model: this.modelId });
      if (error) throw error;
      this.lm = lm;
      this.status = ModelStatus.READY;
    } catch (e) {
      this.lastError = e as Error;
      this.status = ModelStatus.ERROR;
      throw e;
    }
  }

  private assertIsReady(): void {
    if (this.status !== ModelStatus.READY || !this.lm) {
      throw new Error(
        `Model not ready. Status: ${
          ModelStatus[this.status]
        }. Error: ${this.lastError?.message}`,
      );
    }
  }

  private convertToCactusMessages(
    prompt: LanguageModelV2Prompt,
  ): CactusOAICompatibleMessage[] {
    return prompt.map(message => {
      if (message.role === 'system') {
        return { role: 'system', content: message.content };
      }
      const content = message.content
        .filter(part => part.type === 'text')
        .map(part => (part as LanguageModelV2TextPart).text)
        .join('');
      return { role: message.role, content };
    });
  }

  private getCactusParams(
    options: LanguageModelV2CallOptions,
  ): CompletionParams {
    const params: CompletionParams = {};
    if (options.temperature != null) params.temperature = options.temperature;
    if (options.maxOutputTokens != null) params.n_predict = options.maxOutputTokens;
    if (options.stopSequences != null) params.stop = options.stopSequences;
    return params;
  }

  get supportedUrls(): Record<string, RegExp[]> {return {}} // cactus is on-device only

  async doGenerate(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    content: Array<LanguageModelV2Content>;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    warnings: Array<LanguageModelV2CallWarning>;
    request?: { body?: unknown };
    response?: LanguageModelV2ResponseMetadata & {
      headers?: SharedV2Headers;
      body?: unknown;
    };
  }> {
    this.assertIsReady();
    const fullPrompt = this.convertToCactusMessages(options.prompt);
    const newMessages = await this.adaptMessagesToStatefulContext(fullPrompt);

    if (newMessages.length === 0) {
      return {
        content: [],
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
      };
    }

    const params = this.getCactusParams(options);
    const result: NativeCompletionResult = await this.lm!.completion(
      newMessages,
      params,
    );

    this.conversationHistory.push(...newMessages, {
      role: 'assistant',
      content: result.content,
    });

    return {
      content: [{ type: 'text', text: result.content }],
      finishReason: 'stop' as const,
      usage: {
        inputTokens: result.tokens_evaluated,
        outputTokens: result.tokens_predicted,
        totalTokens: result.tokens_evaluated + result.tokens_predicted,
      },
      warnings: [],
    };
  }

  async doStream(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    warnings: Array<LanguageModelV2CallWarning>;
    request?: { body?: unknown };
    response?: {
      headers?: SharedV2Headers;
    };
  }> {
    this.assertIsReady();
    const fullPrompt = this.convertToCactusMessages(options.prompt);
    const newMessages = await this.adaptMessagesToStatefulContext(fullPrompt);
    const params = this.getCactusParams(options);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start: async controller => {
        if (newMessages.length === 0) {
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          });
          controller.close();
          return;
        }

        let fullResponse = '';
        const completionPromise = this.lm!.completion(
          newMessages,
          params,
          data => {
            // This callback is invoked from the native side for each token
            fullResponse += data.token;
            controller.enqueue({ type: 'text', text: data.token });
          },
        );

        completionPromise
          .then(result => {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                inputTokens: result.tokens_evaluated,
                outputTokens: result.tokens_predicted,
                totalTokens:
                  result.tokens_evaluated + result.tokens_predicted,
              },
            });
            this.conversationHistory.push(...newMessages, {
              role: 'assistant',
              content: fullResponse,
            });
            controller.close();
          })
          .catch(error => {
            controller.error(error);
          });
      },
    });

    return { stream, warnings: [] };
  }
} 