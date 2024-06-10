import { loadApiKey, loadSetting } from '@ai-sdk/provider-utils';
import { AzureOpenAIChatSettings } from './azure-openai-chat-settings';
import { AzureOpenAIChatLanguageModel } from './azure-openai-chat-language-model';

export interface AzureOpenAIProvider {
  (
    deploymentId: string,
    settings?: AzureOpenAIChatSettings,
  ): AzureOpenAIChatLanguageModel;

  /**
Creates an Azure OpenAI chat model for text generation.
   */
  chat(
    deploymentId: string,
    settings?: AzureOpenAIChatSettings,
  ): AzureOpenAIChatLanguageModel;
}

export interface AzureOpenAIProviderSettings {
  /**
Name of the Azure OpenAI resource.
     */
  resourceName?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;
}

/**
Create an Azure OpenAI provider instance.
 */
export function createAzureOpenAI(
  options: AzureOpenAIProviderSettings = {},
): AzureOpenAIProvider {
  const getHeaders = () => ({
    'api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AZURE_OPENAI_API_KEY',
      description: 'Azure OpenAI',
    }),
  });

  const getResourceName = () =>
    loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_OPENAI_RESOURCE_NAME',
      description: 'Azure OpenAI resource name',
    });

  const createChatModel = (
    deploymentName: string,
    settings: AzureOpenAIChatSettings = {},
  ) =>
    new AzureOpenAIChatLanguageModel(deploymentName, settings, {
      provider: 'azure-openai.chat',
      headers: getHeaders,
      resourceName: getResourceName,
    });

  const provider = function (
    deploymentId: string,
    settings?: AzureOpenAIChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Azure OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(deploymentId, settings as AzureOpenAIChatSettings);
  };

  provider.chat = createChatModel;

  return provider as AzureOpenAIProvider;
}

/**
Default Azure OpenAI provider instance.
 */
export const azureOpenAI = createAzureOpenAI({});
