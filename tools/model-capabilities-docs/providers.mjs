import { formatSupport } from './render-tables.mjs';

// Register a provider here to generate its docs from its source catalog.
// Table IDs match the model-capabilities markers in the provider's MDX file.
// Columns are [heading, capability path, optional formatter].
// Omit overviewLink for providers that do not appear in the language overview.
export const providers = [
  {
    catalogPath: 'packages/openai/src/openai-model-catalog.ts',
    catalogExport: 'openaiModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/03-openai.mdx',
    overviewLink: '[OpenAI](/providers/ai-sdk-providers/openai)',
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
    overviewLink: '[Anthropic](/providers/ai-sdk-providers/anthropic)',
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
];

function formatOptionalSupport(value) {
  return formatSupport(value ?? 'unknown');
}
