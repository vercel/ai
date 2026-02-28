import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3CountTokensOptions,
  LanguageModelV3CountTokensResult,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockLanguageModelV3 implements LanguageModelV3 {
  readonly specificationVersion = 'v3';

  private _supportedUrls: () => LanguageModelV3['supportedUrls'];

  readonly provider: LanguageModelV3['provider'];
  readonly modelId: LanguageModelV3['modelId'];

  doGenerate: LanguageModelV3['doGenerate'];
  doStream: LanguageModelV3['doStream'];
  doCountTokens?: LanguageModelV3['doCountTokens'];

  doGenerateCalls: LanguageModelV3CallOptions[] = [];
  doStreamCalls: LanguageModelV3CallOptions[] = [];
  doCountTokensCalls: LanguageModelV3CountTokensOptions[] = [];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportedUrls = {},
    doGenerate = notImplemented,
    doStream = notImplemented,
    doCountTokens,
  }: {
    provider?: LanguageModelV3['provider'];
    modelId?: LanguageModelV3['modelId'];
    supportedUrls?:
      | LanguageModelV3['supportedUrls']
      | (() => LanguageModelV3['supportedUrls']);
    doGenerate?:
      | LanguageModelV3['doGenerate']
      | LanguageModelV3GenerateResult
      | LanguageModelV3GenerateResult[];
    doStream?:
      | LanguageModelV3['doStream']
      | LanguageModelV3StreamResult
      | LanguageModelV3StreamResult[];
    doCountTokens?:
      | LanguageModelV3['doCountTokens']
      | LanguageModelV3CountTokensResult;
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = async options => {
      this.doGenerateCalls.push(options);

      if (typeof doGenerate === 'function') {
        return doGenerate(options);
      } else if (Array.isArray(doGenerate)) {
        return doGenerate[this.doGenerateCalls.length];
      } else {
        return doGenerate;
      }
    };
    this.doStream = async options => {
      this.doStreamCalls.push(options);

      if (typeof doStream === 'function') {
        return doStream(options);
      } else if (Array.isArray(doStream)) {
        return doStream[this.doStreamCalls.length];
      } else {
        return doStream;
      }
    };
    if (doCountTokens !== undefined) {
      this.doCountTokens = async options => {
        this.doCountTokensCalls.push(options);

        if (typeof doCountTokens === 'function') {
          return doCountTokens(options);
        } else {
          return doCountTokens;
        }
      };
    }
    this._supportedUrls =
      typeof supportedUrls === 'function'
        ? supportedUrls
        : async () => supportedUrls;
  }

  get supportedUrls() {
    return this._supportedUrls();
  }
}
