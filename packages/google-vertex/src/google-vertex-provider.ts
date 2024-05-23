import { VertexAI } from '@google-cloud/vertexai';
import { GoogleVertexLanguageModel } from './google-vertex-language-model';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { generateId, loadApiKey } from '@ai-sdk/provider-utils';

export interface GoogleVertexProvider {
  /**
Creates a model for text generation.
   */
  (
    modelId: GoogleVertexModelId,
    settings?: GoogleVertexSettings,
  ): GoogleVertexLanguageModel;
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
export function createGoogleVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  const createVertexAI = () => {
    // TODO introduce load environment variable
    const project = loadApiKey({
      apiKey: options.project,
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
      description: 'Google Vertex project',
    });

    // TODO introduce load environment variable
    const location = loadApiKey({
      apiKey: options.location,
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
      description: 'Google Vertex location',
    });

    return (
      options.createVertexAI?.({ project, location }) ??
      new VertexAI({ project, location })
    );
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

  provider.chat = createChatModel;

  return provider as GoogleVertexProvider;
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createGoogleVertex();
