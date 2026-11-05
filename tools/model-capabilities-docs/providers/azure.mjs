export const azureDocs = {
  catalogPath: 'packages/azure/src/azure-deployment-model-catalog.ts',
  catalogExport: 'azureDeploymentModelCatalog',
  providerOptionsExport: 'azureProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/04-azure.mdx',
  tables: [
    {
      id: 'azure-image',
      capability: 'image',
      columns: [
        [
          'Sizes',
          'sizes',
          v => (Array.isArray(v) ? v.join(', ') : v.description),
        ],
      ],
    },
    {
      id: 'azure-transcription',
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
      id: 'azure-speech',
      capability: 'speech',
      columns: [['Instructions', 'instructions']],
    },
  ],
  providerOptionTables: [{ id: 'azure-provider-options' }],
};
