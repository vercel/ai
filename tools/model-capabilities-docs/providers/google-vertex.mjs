export const googleVertexDocs = {
  catalogPath: 'packages/google-vertex/src/google-vertex-model-catalog.ts',
  catalogExport: 'googleVertexModelCatalog',
  providerOptionsExport: 'googleVertexProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/16-google-vertex.mdx',
  tables: [
    {
      id: 'google-vertex-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'google-vertex-embedding',
      capability: 'embedding',
      columns: [
        ['Max Values Per Call', 'maxEmbeddingsPerCall', String],
        ['Parallel Calls', 'supportsParallelCalls'],
        ['Multimodal', 'multimodal'],
      ],
    },
    {
      id: 'google-vertex-image',
      capability: 'image',
      filter: entry => entry.capabilities.image?.imageGeneration != null,
      columns: [
        ['Image Generation', 'imageGeneration'],
        ['Image Editing', 'fileInput'],
        ['Aspect Ratios', 'aspectRatios', v => v.join(', ')],
      ],
    },
    {
      id: 'google-vertex-video',
      capability: 'video',
      columns: [['Audio Support', 'generateAudio']],
    },
    {
      id: 'google-vertex-speech',
      capability: 'speech',
      columns: [
        ['Multi-speaker', 'multiSpeaker'],
        ['Style via instructions', 'instructions'],
      ],
    },
    {
      id: 'google-vertex-transcription',
      capability: 'transcription',
      filter: entry =>
        entry.capabilities.transcription?.wordTimestampDescription != null,
      columns: [
        ['Word timestamps', 'wordTimestampDescription', String],
        ['Language detection', 'languageDetectionDescription', String],
      ],
    },
    {
      id: 'google-vertex-anthropic',
      catalogExport: 'googleVertexAnthropicModelCatalog',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['Computer Use', 'tools.computerUse'],
      ],
    },
    {
      id: 'google-vertex-xai',
      catalogExport: 'googleVertexXaiModelCatalog',
      capability: 'language',
      columns: [['Reasoning', 'reasoning.support']],
    },
    {
      id: 'google-vertex-maas',
      catalogExport: 'googleVertexMaasModelCatalog',
      capability: 'language',
      columns: [['Provider', 'publisher', String]],
    },
    {
      id: 'google-vertex-transcription-all',
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
  providerOptionTables: [{ id: 'google-vertex-provider-options' }],
};
