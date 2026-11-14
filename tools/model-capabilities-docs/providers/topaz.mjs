export const topazDocs = {
  "catalogPath": "packages/topaz/src/topaz-model-catalog.ts",
  "catalogExport": "topazModelCatalog",
  "providerOptionsExport": "topazProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/210-topaz.mdx",
  "tables": [
    {
      "id": "topaz-image",
      "capability": "image",
      "columns": [
        [
          "Image Input",
          "fileInput"
        ],
        [
          "Mask Input",
          "maskInput"
        ]
      ]
    },
    {
      "id": "topaz-video",
      "capability": "video",
      "columns": [
        [
          "Video Input",
          "inputs.referenceVideo"
        ],
        [
          "Text Input",
          "inputs.text"
        ],
        [
          "Audio Generation",
          "generateAudio"
        ],
        [
          "Resolution",
          "resolution"
        ],
        [
          "FPS",
          "fps"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "topaz-provider-options"
    }
  ]
};
