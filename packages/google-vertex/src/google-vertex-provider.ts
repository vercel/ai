import { generateId, loadSetting } from '@ai-sdk/provider-utils';
import { VertexAI, VertexInit } from '@google-cloud/vertexai';
import { GoogleVertexLanguageModel } from './google-vertex-language-model';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';

export interface GoogleVertexProvider {
  /**
Creates a model for text generation.
   */
  (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ): GoogleVertexLanguageModel;

  languageModel: (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ) => GoogleVertexLanguageModel;
}

export interface GoogleVertexProviderSettings {
  /**
Your Google Vertex location. Defaults to the environment variable `GOOGLE_VERTEX_LOCATION`.
   */
  location?: string;

  /**
Your Google Vertex project. Defaults to the environment variable `GOOGLE_VERTEX_PROJECT`.
  */
  project?: string;

  /**
 Optional. The Authentication options provided by google-auth-library.
Complete list of authentication options is documented in the
GoogleAuthOptions interface:
https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  googleAuthOptions?: VertexInit['googleAuthOptions'];

  // for testing
  generateId?: () => string;

  // for testing
  createVertexAI?: ({
    project,
    location,
  }: {
    project: string;
    location: string;
  }) => VertexAI;
}

/**
Create a Google Vertex AI provider instance.
 */
export function createVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  const createVertexAI = () => {
    const config = {
      project: loadSetting({
        settingValue: options.project,
        settingName: 'project',
        environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
        description: 'Google Vertex project',
      }),
      location: loadSetting({
        settingValue: options.location,
        settingName: 'location',
        environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
        description: 'Google Vertex location',
      }),
      googleAuthOptions: options.googleAuthOptions,
    };

    return options.createVertexAI?.(config) ?? new VertexAI(config);
  };

  const createChatModel = (
    modelId: GoogleVertexModelId,
    settings: GoogleVertexSettings = {},
  ) =>
    new GoogleVertexLanguageModel(modelId, settings, {
      vertexAI: createVertexAI(),
      generateId: options.generateId ?? generateId,
    });

  const provider = function (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Google Vertex AI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;

  return provider as GoogleVertexProvider;
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
