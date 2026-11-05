import { blackForestLabsDocs } from './providers/black-forest-labs.mjs';
import { replicateDocs } from './providers/replicate.mjs';
import { falDocs } from './providers/fal.mjs';
import { voyageDocs } from './providers/voyage.mjs';
import { huggingfaceDocs } from './providers/huggingface.mjs';
import { basetenDocs } from './providers/baseten.mjs';
import { deepinfraDocs } from './providers/deepinfra.mjs';
import { fireworksDocs } from './providers/fireworks.mjs';
import { togetheraiDocs } from './providers/togetherai.mjs';
import { zaiDocs } from './providers/zai.mjs';
import { moonshotaiDocs } from './providers/moonshotai.mjs';
import { minimaxDocs } from './providers/minimax.mjs';
import { alibabaDocs } from './providers/alibaba.mjs';
import { openResponsesDocs } from './providers/open-responses.mjs';
import { openaiCompatibleDocs } from './providers/openai-compatible.mjs';
import { anthropicAwsDocs } from './providers/anthropic-aws.mjs';
import { googleVertexDocs } from './providers/google-vertex.mjs';
import { amazonBedrockDocs } from './providers/amazon-bedrock.mjs';
import { azureDocs } from './providers/azure.mjs';
import { formatSupport } from './render-tables.mjs';

// Register a provider here to generate its docs from its source catalog.
// Table IDs match the model-capabilities markers in the provider's MDX file.
// Columns are [heading, capability path, optional formatter].
export const providers = [
  blackForestLabsDocs,
  replicateDocs,
  falDocs,
  voyageDocs,
  huggingfaceDocs,
  basetenDocs,
  deepinfraDocs,
  fireworksDocs,
  togetheraiDocs,
  zaiDocs,
  moonshotaiDocs,
  minimaxDocs,
  alibabaDocs,
  openResponsesDocs,
  openaiCompatibleDocs,
  anthropicAwsDocs,
  googleVertexDocs,
  amazonBedrockDocs,
  azureDocs,
  {
    catalogPath: 'packages/perplexity/src/perplexity-model-catalog.ts',
    catalogExport: 'perplexityModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/70-perplexity.mdx',
    tables: [
      {
        id: 'perplexity-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
        ],
      },
      {
        id: 'perplexity-embedding',
        capability: 'embedding',
        columns: [
          ['Dimensions', 'defaultDimensions', String],
          ['Max Values Per Call', 'maxEmbeddingsPerCall', String],
        ],
      },
      {
        id: 'perplexity-decision',
        capability: 'decision',
        columns: [
          ['Boolean', 'questionTypes.boolean'],
          ['Choice', 'questionTypes.choice'],
          ['Score', 'questionTypes.score'],
          ['Box', 'questionTypes.box'],
          ['Image Input', 'inputs.image'],
          ['Reasoning', 'reasoning'],
          ['Max Output Tokens', 'maxOutputTokens'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/cerebras/src/cerebras-model-catalog.ts',
    catalogExport: 'cerebrasModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/40-cerebras.mdx',
    tables: [
      {
        id: 'cerebras-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
          ['Reasoning', 'reasoning.support'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/deepseek/src/deepseek-model-catalog.ts',
    catalogExport: 'deepseekModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/30-deepseek.mdx',
    tables: [
      {
        id: 'deepseek-language',
        capability: 'language',
        columns: [
          ['Text Generation', 'textGeneration'],
          ['Object Generation', 'objectGeneration'],
          ['Image Input', 'inputs.image'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/cohere/src/cohere-model-catalog.ts',
    catalogExport: 'cohereModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/25-cohere.mdx',
    tables: [
      {
        id: 'cohere-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
        ],
      },
      {
        id: 'cohere-embedding',
        capability: 'embedding',
        columns: [
          ['Default Dimensions', 'defaultDimensions', String],
          ['Supported Dimensions', 'dimensions', values => values.join(', ')],
          ['Custom Dimensions', 'customDimensions'],
        ],
      },
      {
        id: 'cohere-reranking',
        capability: 'reranking',
        columns: [
          ['Text Documents', 'documents.text'],
          ['Object Documents', 'documents.object'],
          ['Top N', 'topN'],
        ],
      },
    ],
  },
  {
    catalogPath: 'packages/groq/src/groq-model-catalog.ts',
    catalogExport: 'groqModelCatalog',
    docsPath: 'content/providers/01-ai-sdk-providers/09-groq.mdx',
    tables: [
      {
        id: 'groq-language',
        capability: 'language',
        columns: [
          ['Image Input', 'inputs.image'],
          ['Object Generation', 'objectGeneration'],
          ['Tool Usage', 'tools.usage'],
          ['Tool Streaming', 'tools.streaming'],
          ['Browser Search', 'tools.browserSearch'],
        ],
      },
      {
        id: 'groq-transcription',
        capability: 'transcription',
        columns: [
          ['Transcription', 'transcription'],
          ['Streaming', 'streaming'],
          ['Duration', 'duration'],
          ['Segments', 'segments'],
          ['Language', 'language'],
        ],
      },
    ],
  },
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
