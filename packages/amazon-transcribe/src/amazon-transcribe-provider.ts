import {
  NoSuchModelError,
  type ProviderV4,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  generateId,
  loadOptionalSetting,
  loadSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import type { AmazonTranscribeConfig } from './amazon-transcribe-config';
import {
  createAmazonTranscribeSigV4FetchFunction,
  type AmazonTranscribeCredentials,
} from './amazon-transcribe-sigv4-fetch';
import { AmazonTranscribeTranscriptionModel } from './amazon-transcribe-transcription-model';
import type { AmazonTranscribeTranscriptionModelId } from './amazon-transcribe-transcription-options';
import { VERSION } from './version';

export interface AmazonTranscribeProviderSettings {
  /**
   * The AWS region to use for Amazon Transcribe. Defaults to the value of the
   * `AWS_REGION` environment variable.
   */
  region?: string;

  /**
   * The AWS access key ID. Defaults to the value of the `AWS_ACCESS_KEY_ID`
   * environment variable.
   */
  accessKeyId?: string;

  /**
   * The AWS secret access key. Defaults to the value of the
   * `AWS_SECRET_ACCESS_KEY` environment variable.
   */
  secretAccessKey?: string;

  /**
   * The AWS session token. When `accessKeyId` and `secretAccessKey` are both
   * passed explicitly, only this field is used. Otherwise it falls back to the
   * `AWS_SESSION_TOKEN` environment variable.
   */
  sessionToken?: string;

  /**
   * The AWS credential provider to use to get dynamic credentials (similar to
   * the AWS SDK). When set, its credential values are used instead of the
   * `accessKeyId`, `secretAccessKey`, and `sessionToken` settings.
   */
  credentialProvider?: () => PromiseLike<
    Omit<AmazonTranscribeCredentials, 'region'>
  >;

  /**
   * Base URL for the Amazon Transcribe API calls.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  // for testing
  generateId?: () => string;
}

export interface AmazonTranscribeProvider extends ProviderV4 {
  (modelId?: AmazonTranscribeTranscriptionModelId): TranscriptionModelV4;

  /**
   * Creates a model for transcription.
   */
  transcription(
    modelId?: AmazonTranscribeTranscriptionModelId,
  ): TranscriptionModelV4;

  /**
   * Creates a model for transcription.
   */
  transcriptionModel(
    modelId?: AmazonTranscribeTranscriptionModelId,
  ): TranscriptionModelV4;
}

/**
 * Create an Amazon Transcribe provider instance.
 */
export function createAmazonTranscribe(
  options: AmazonTranscribeProviderSettings = {},
): AmazonTranscribeProvider {
  const getRegion = (): string =>
    loadSetting({
      settingValue: options.region,
      settingName: 'region',
      environmentVariableName: 'AWS_REGION',
      description: 'AWS region',
    });

  const getCredentials = async (): Promise<AmazonTranscribeCredentials> => {
    const region = getRegion();

    if (options.credentialProvider) {
      return { ...(await options.credentialProvider()), region };
    }

    return {
      region,
      accessKeyId: loadSetting({
        settingValue: options.accessKeyId,
        settingName: 'accessKeyId',
        environmentVariableName: 'AWS_ACCESS_KEY_ID',
        description: 'AWS access key ID',
      }),
      secretAccessKey: loadSetting({
        settingValue: options.secretAccessKey,
        settingName: 'secretAccessKey',
        environmentVariableName: 'AWS_SECRET_ACCESS_KEY',
        description: 'AWS secret access key',
      }),
      sessionToken:
        options.accessKeyId != null && options.secretAccessKey != null
          ? options.sessionToken
          : loadOptionalSetting({
              settingValue: options.sessionToken,
              environmentVariableName: 'AWS_SESSION_TOKEN',
            }),
    };
  };

  const transcribeFetch = createAmazonTranscribeSigV4FetchFunction(
    getCredentials,
    'transcribe',
    options.fetch,
  );
  const s3Fetch = createAmazonTranscribeSigV4FetchFunction(
    getCredentials,
    's3',
    options.fetch,
  );

  const getHeaders = () =>
    withUserAgentSuffix(
      options.headers ?? {},
      `ai-sdk/amazon-transcribe/${VERSION}`,
    );

  const getTranscribeBaseUrl = (): string =>
    withoutTrailingSlash(
      options.baseURL ?? `https://transcribe.${getRegion()}.amazonaws.com`,
    ) ?? `https://transcribe.${getRegion()}.amazonaws.com`;

  const config: AmazonTranscribeConfig = {
    provider: 'amazon-transcribe.transcription',
    region: getRegion,
    transcribeBaseUrl: getTranscribeBaseUrl,
    s3ObjectUrl: ({ bucket, key }) =>
      `https://s3.${getRegion()}.amazonaws.com/${bucket}/${encodeS3Key(key)}`,
    headers: getHeaders,
    transcribeFetch,
    s3Fetch,
    fetch: options.fetch,
    generateId: options.generateId ?? generateId,
  };

  const createTranscriptionModel = (
    modelId: AmazonTranscribeTranscriptionModelId = 'default',
  ) => new AmazonTranscribeTranscriptionModel(modelId, config);

  const provider = function (
    modelId: AmazonTranscribeTranscriptionModelId = 'default',
  ) {
    if (new.target) {
      throw new Error(
        'The Amazon Transcribe model function cannot be called with the new keyword.',
      );
    }

    return createTranscriptionModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.languageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'languageModel',
      message: 'Amazon Transcribe does not provide language models',
    });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'embeddingModel',
      message: 'Amazon Transcribe does not provide text embedding models',
    });
  };
  provider.textEmbeddingModel = provider.embeddingModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: 'imageModel',
      message: 'Amazon Transcribe does not provide image models',
    });
  };

  return provider as AmazonTranscribeProvider;
}

function encodeS3Key(key: string): string {
  return key
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

/**
 * Default Amazon Transcribe provider instance.
 */
export const amazonTranscribe = createAmazonTranscribe();
