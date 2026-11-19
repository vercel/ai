export const tencentDocs = {
  "catalogPath": "packages/tencent/src/tencent-model-catalog.ts",
  "catalogExport": "tencentModelCatalog",
  "providerOptionsExport": "tencentProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/240-tencent.mdx",
  "tables": [
    {
      "id": "tencent-language",
      "capability": "language",
      "columns": [
        [
          "Chat Completions",
          "chatCompletions"
        ]
      ]
    },
    {
      "id": "tencent-video",
      "capability": "video",
      "columns": [
        [
          "Text Input",
          "inputs.text"
        ],
        [
          "Image Input",
          "inputs.image"
        ],
        [
          "Reference Image",
          "inputs.referenceImage"
        ],
        [
          "Reference Video",
          "inputs.referenceVideo"
        ],
        [
          "Audio Generation",
          "generateAudio"
        ],
        [
          "Seed",
          "seed"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "tencent-provider-options"
    }
  ]
};
