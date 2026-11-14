export const humeDocs = {
  "catalogPath": "packages/hume/src/hume-model-catalog.ts",
  "catalogExport": "humeModelCatalog",
  "providerOptionsExport": "humeProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/150-hume.mdx",
  "tables": [
    {
      "id": "hume-speech",
      "capability": "speech",
 "formatModelId": id => id === "" ? "default" : id,
      "columns": [
        [
          "Instructions",
          "instructions"
        ],
        [
          "Speed",
          "speed"
        ],
        [
          "Output Formats",
          "outputFormats", formats => formats.join(", ")
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "hume-provider-options"
    }
  ]
};
