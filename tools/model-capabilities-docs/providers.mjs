import { formatSupport } from './render-tables.mjs';

// Register a provider here to generate its docs from its source catalogs.
// Each table lists the known models of one exported catalog. Table IDs match
// the model-capabilities markers in the provider's MDX file. Columns are
// [heading, function from model capabilities to cell text].
// Omit overview for providers that do not appear in the language overview.
export const providers = [
  {
    catalogPath: 'packages/openai/src/openai-model-catalog.ts',
    docsPath: 'content/providers/01-ai-sdk-providers/03-openai.mdx',
    overview: {
      link: '[OpenAI](/providers/ai-sdk-providers/openai)',
      catalog: 'openaiLanguageModelCatalog',
    },
    tables: [
      {
        id: 'openai-language',
        catalog: 'openaiLanguageModelCatalog',
        columns: [
          ['Image Input', model => formatSupport(model.inputs.image)],
          ['Audio Input', model => formatSupport(model.inputs.audio)],
          ['Object Generation', model => formatSupport(model.objectGeneration)],
          ['Tool Usage', model => formatSupport(model.tools.usage)],
        ],
      },
      {
        id: 'openai-language-request',
        catalog: 'openaiLanguageModelCatalog',
        columns: [
          ['Reasoning', model => formatSupport(model.reasoning != null)],
          [
            'Reasoning Efforts',
            model =>
              model.reasoning?.efforts == null
                ? 'Not declared'
                : model.reasoning.efforts.map(value => `\`${value}\``).join(', '),
          ],
          ['Temperature', formatOpenAISamplingSupport],
          ['Top P', formatOpenAISamplingSupport],
        ],
      },
      {
        id: 'openai-realtime',
        catalog: 'openaiRealtimeModelCatalog',
        columns: [
          ['Conversation', model => model.conversation],
          ['Transports', model => model.transports.join(', ')],
        ],
      },
      {
        id: 'openai-embedding',
        catalog: 'openaiEmbeddingModelCatalog',
        columns: [
          ['Default Dimensions', model => String(model.defaultDimensions)],
          ['Custom Dimensions', model => formatSupport(model.customDimensions)],
        ],
      },
      {
        id: 'openai-image',
        catalog: 'openaiImageModelCatalog',
        columns: [
          [
            'Sizes',
            model =>
              model.sizes == null
                ? 'Not declared'
                : model.sizes === 'custom'
                  ? 'Standard presets and custom dimensions'
                  : model.sizes.join(', '),
          ],
        ],
      },
      {
        id: 'openai-transcription',
        catalog: 'openaiTranscriptionModelCatalog',
        columns: [
          ['Transcription', model => formatSupport(model.transcription)],
          ['Streaming', model => formatSupport(model.streaming)],
          ['Duration', model => formatSupport(model.duration)],
          ['Segments', model => formatSupport(model.segments)],
          ['Language', model => formatSupport(model.language)],
        ],
      },
      {
        id: 'openai-speech-translation',
        catalog: 'openaiSpeechTranslationModelCatalog',
        columns: [
          ['Translated Audio', model => formatSupport(model.translatedAudio)],
          ['Translated Text', model => formatSupport(model.translatedText)],
          [
            'Source Transcript',
            model => formatSupport(model.sourceTranscript),
          ],
        ],
      },
      {
        id: 'openai-speech',
        catalog: 'openaiSpeechModelCatalog',
        columns: [['Instructions', model => formatSupport(model.instructions)]],
      },
    ],
  },
  {
    catalogPath: 'packages/anthropic/src/anthropic-model-catalog.ts',
    docsPath: 'content/providers/01-ai-sdk-providers/05-anthropic.mdx',
    overview: {
      link: '[Anthropic](/providers/ai-sdk-providers/anthropic)',
      catalog: 'anthropicLanguageModelCatalog',
    },
    tables: [
      {
        id: 'anthropic-language',
        catalog: 'anthropicLanguageModelCatalog',
        columns: [
          ['Image Input', model => formatSupport(model.inputs.image)],
          ['Object Generation', model => formatSupport(model.objectGeneration)],
          ['Tool Usage', model => formatSupport(model.tools.usage)],
          ['Computer Use', model => formatSupport(model.tools.computerUse)],
          ['Web Search', model => formatSupport(model.tools.webSearch)],
          ['Tool Search', model => formatSupport(model.tools.toolSearch)],
          ['Compaction', model => formatSupport(model.compaction)],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/google/src/google-model-catalog.ts',
    docsPath: 'content/providers/01-ai-sdk-providers/15-google.mdx',
    overview: {
      link: '[Google](/providers/ai-sdk-providers/google)',
      catalog: 'googleLanguageModelCatalog',
    },
    tables: [
      {
        id: 'google-language',
        catalog: 'googleLanguageModelCatalog',
        columns: [
          ['Image Input', model => formatSupport(model.inputs.image)],
          ['Object Generation', model => formatSupport(model.objectGeneration)],
          ['Tool Usage', model => formatSupport(model.tools.usage)],
          ['Tool Streaming', model => formatSupport(model.tools.streaming)],
          ['Google Search', model => formatSupport(model.tools.googleSearch)],
          ['URL Context', model => formatSupport(model.tools.urlContext)],
        ],
      },
    ],
  },
];

function formatOpenAISamplingSupport(model) {
  if (model.reasoning == null) return formatSupport(true);
  return model.reasoning.samplingWithEffortNone
    ? 'Conditional: Only when reasoning effort is none.'
    : formatSupport(false);
}
