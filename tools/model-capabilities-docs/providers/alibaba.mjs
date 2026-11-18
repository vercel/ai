export const alibabaDocs = {
  catalogPath: 'packages/alibaba/src/alibaba-model-catalog.ts',
  catalogExport: 'alibabaModelCatalog',
  providerOptionsExport: 'alibabaProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/32-alibaba.mdx',
  tables: [
    {
      id: 'alibaba-embedding',
      capability: 'embedding',
      columns: [
        ['Default Dimensions', 'defaultDimensions', String],
        ['Flexible Dimensions', 'dimensions', v => v.join(', ')],
        ['Max Values per Call', 'maxEmbeddingsPerCall', String],
      ],
    },
    {
      id: 'alibaba-video-t2v',
      capability: 'video',
      filter: function anonymous(entry) {
        return (
          entry.requestConfig?.video?.mode === 't2v' &&
          entry.capabilities.video?.audioMode != null
        );
      },
      columns: [
        ['Audio', 'audioMode', String],
        ['Resolution', 'resolutionTiers', v => v.join(', ')],
        ['Duration', 'durationRange', String],
      ],
    },
    {
      id: 'alibaba-video-i2v',
      capability: 'video',
      filter: function anonymous(entry) {
        return (
          entry.requestConfig?.video?.mode === 'i2v' &&
          entry.capabilities.video?.audioMode != null
        );
      },
      columns: [
        ['Audio', 'audioMode', String],
        ['Resolution', 'resolutionTiers', v => v.join(', ')],
        ['Duration', 'durationRange', String],
      ],
    },
    {
      id: 'alibaba-video-r2v',
      capability: 'video',
      filter: function anonymous(entry) {
        return (
          entry.requestConfig?.video?.mode === 'r2v' &&
          entry.capabilities.video?.audioMode != null
        );
      },
      columns: [
        ['Audio', 'audioMode', String],
        ['Resolution', 'resolutionTiers', v => v.join(', ')],
        ['Duration', 'durationRange', String],
      ],
    },
    {
      id: 'alibaba-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
        ['JSON Schema', 'structuredOutput.jsonSchema'],
        ['Preserved Thinking', 'reasoning.preserved'],
      ],
    },
    {
      id: 'alibaba-video-all',
      capability: 'video',
      columns: [
        ['Text Input', 'inputs.text'],
        ['Image Input', 'inputs.image'],
        ['First Frame', 'inputs.firstFrame'],
        ['Last Frame', 'inputs.lastFrame'],
        ['Reference Images', 'inputs.referenceImage'],
        ['Reference Video', 'inputs.referenceVideo'],
        ['Audio', 'generateAudio'],
        ['Aspect Ratio', 'aspectRatio'],
        ['Resolution', 'resolution'],
        ['Duration', 'duration'],
        ['FPS', 'fps'],
        ['Seed', 'seed'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'alibaba-provider-options' }],
};
