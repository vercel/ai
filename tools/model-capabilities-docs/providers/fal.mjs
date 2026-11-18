export const falDocs = {
  catalogPath: 'packages/fal/src/fal-model-catalog.ts',
  catalogExport: 'falModelCatalog',
  providerOptionsExport: 'falProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/10-fal.mdx',
  tables: [
    {
      id: 'fal-image',
      capability: 'image',
      columns: [
        ['Description', 'description', v => v ?? 'Not declared'],
        [
          'Sizes',
          'sizes',
          v => (Array.isArray(v) ? v.join(', ') : v.description),
        ],
        ['Image Editing', 'fileInput'],
        ['Mask Input', 'maskInput'],
        ['Max Images Per Call', 'maxImagesPerCall', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'fal-speech',
      capability: 'speech',
      columns: [
        ['Description', 'description', v => v ?? 'Not declared'],
        ['Instructions', 'instructions'],
      ],
    },
    {
      id: 'fal-transcription',
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
      id: 'fal-video',
      capability: 'video',
      columns: [
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
  providerOptionTables: [{ id: 'fal-provider-options' }],
};
