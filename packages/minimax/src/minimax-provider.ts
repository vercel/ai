import { SpeechModelV2, ProviderV2 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { MinimaxSpeechModel } from './minimax-speech-model';
import { MinimaxSpeechModelId } from './minimax-speech-options';

export interface MinimaxProvider extends Pick<ProviderV2, 'speechModel'> {
  (
    modelId: 'speech-02-hd',
    settings?: {},
  ): {
    speech: MinimaxSpeechModel;
  };

  /**
Creates a model for speech synthesis.
   */
  speech(modelId: MinimaxSpeechModelId): SpeechModelV2;
}

export interface MinimaxProviderSettings {
  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * The group to which the user belongs. Use the pre-generated value. The value should be spliced at the end of the url that calls the API.
   */
  groupId?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create an Minimax provider instance.
 */
export function createMinimax(
  options: MinimaxProviderSettings = {},
): MinimaxProvider {
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'MINIMAX_API_KEY',
      description: 'Minimax API key',
    })}`,
    ...options.headers,
  });

  const createSpeechModel = (modelId: MinimaxSpeechModelId) =>
    new MinimaxSpeechModel(modelId, {
      provider: `minimax.speech`,
      url: ({ path }) => {
        const groupId = loadApiKey({
          apiKey: options.groupId,
          apiKeyParameterName: 'groupId',
          environmentVariableName: 'MINIMAX_GROUP_ID',
          description: 'Minimax Group ID',
        });
        return `https://api.minimaxi.chat${path}?GroupId=${groupId}`;
      },
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: MinimaxSpeechModelId) {
    return {
      speech: createSpeechModel(modelId),
    };
  };

  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;

  return provider as MinimaxProvider;
}

/**
Default Minimax provider instance.
 */
export const minimax = createMinimax();
