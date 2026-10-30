import { formatSupport } from './render-tables.mjs';

// Register a provider here to generate its docs from its source catalog.
// Table IDs match the model-capabilities markers in the provider's MDX file.
// Columns are [heading, capability path, optional formatter].
export const providers = [
  {
    catalogPath: 'packages/openai/src/openai-model-catalog.ts',
    catalogExport: 'openaiModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/03-openai.mdx',
    tables: [
      {
        id: 'openai-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Audio Input', 'inputs.audio'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
        ],
      },
      {
        id: 'openai-language-request',
        capability: 'language',
        columns: [
          ['Reasoning', 'reasoning.support'],
          [
            'Reasoning Efforts',
            'reasoning.efforts',
            values =>
              values == null
                ? 'Not declared'
                : values.map(value => `\`${value}\``).join(', '),
          ],
          ['Temperature', 'sampling.temperature', formatOptionalSupport],
          ['Top P', 'sampling.topP', formatOptionalSupport],
        ],
      },
      {
        id: 'openai-realtime',
        capability: 'realtime',
        columns: [
          ['Conversation', 'conversation', String],
          ['Transports', 'transports', values => values.join(', ')],
        ],
      },
      {
        id: 'openai-embedding',
        capability: 'embedding',
        columns: [
          ['Default Dimensions', 'defaultDimensions', String],
          ['Custom Dimensions', 'customDimensions'],
        ],
      },
      {
        id: 'openai-image',
        capability: 'image',
        columns: [
          [
            'Sizes',
            'sizes',
            value =>
              Array.isArray(value) ? value.join(', ') : value.description,
          ],
        ],
      },
      {
        id: 'openai-transcription',
        capability: 'transcription',
        columns: [
          ['Transcription', 'transcription'],
          ['Streaming', 'streaming'],
          ['Duration', 'duration'],
          ['Segments', 'segments'],
          ['Language', 'language'],
        ],
      },
      {
        id: 'openai-speech-translation',
        capability: 'speechTranslation',
        columns: [
          ['Translated Audio', 'translatedAudio'],
          ['Translated Text', 'translatedText'],
          ['Source Transcript', 'sourceTranscript'],
        ],
      },
      {
        id: 'openai-speech',
        capability: 'speech',
        columns: [['Instructions', 'instructions']],
      },
    ],
  },
  {
    catalogPath: 'packages/anthropic/src/anthropic-model-catalog.ts',
    catalogExport: 'anthropicModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/05-anthropic.mdx',
    tables: [
      {
        id: 'anthropic-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Computer Use', 'tools.computerUse'],
          ['Web Search', 'tools.webSearch'],
          ['Tool Search', 'tools.toolSearch'],
          ['Compaction', 'compaction'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/google/src/google-model-catalog.ts',
    catalogExport: 'googleModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/15-google.mdx',
    tables: [
      {
        id: 'google-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
          ['Google Search', 'tools.googleSearch'],
          ['URL Context', 'tools.urlContext'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/mistral/src/mistral-model-catalog.ts',
    catalogExport: 'mistralModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/20-mistral.mdx',
    tables: [
      {
        id: 'mistral-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Tool Usage', 'tools.usage'],
        ],
      },
      {
        id: 'mistral-transcription',
        capability: 'transcription',
        columns: [
          ['Timestamps', 'timestamps'],
          ['Diarization', 'diarization'],
          ['Context Bias', 'contextBias'],
        ],
      },
      {
        id: 'mistral-speech',
        capability: 'speech',
        columns: [
          ['Saved Voices', 'savedVoices'],
          ['Reference Audio', 'referenceAudio'],
          ['Non-Streaming', 'nonStreaming'],
        ],
      },
      {
        id: 'mistral-embedding',
        capability: 'embedding',
        columns: [['Default Dimensions', 'defaultDimensions', String]],
      },
    ],
  },
  {
    catalogPath: 'packages/xai/src/xai-model-catalog.ts',
    catalogExport: 'xaiModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/01-xai.mdx',
    tables: [
      {
        id: 'xai-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
          ['Reasoning', 'reasoning.support'],
        ],
      },
      {
        id: 'xai-image',
        capability: 'image',
        columns: [
          ['Resolution', 'resolutions', formatCodeList],
          ['Aspect Ratios', 'aspectRatios', formatCodeList],
          ['Image Editing', 'fileInput'],
        ],
      },
      {
        id: 'xai-speech',
        capability: 'speech',
        formatModelId: modelId => modelId || 'default',
        columns: [
          ['Language', 'language'],
          ['Speed', 'speed'],
          ['Output Formats', 'outputFormats', values => values.join(', ')],
        ],
      },
      {
        id: 'xai-transcription',
        capability: 'transcription',
        formatModelId: modelId => modelId || 'default',
        columns: [
          ['Request/Response', 'transcription'],
          ['Streaming', 'streaming'],
          ['Word Timestamps', 'wordTimestamps'],
          ['Diarization', 'diarization'],
          ['Multichannel', 'multichannel'],
        ],
      },
    ],
  },
];

function formatOptionalSupport(value) {
  return formatSupport(value ?? 'unknown');
}

function formatCodeList(values) {
  return values.map(value => `\`${value}\``).join(', ');
}
