export const fishAudioDocs = {
  "catalogPath": "packages/fish-audio/src/fish-audio-model-catalog.ts",
  "catalogExport": "fishAudioModelCatalog",
  "providerOptionsExport": "fishAudioProviderOptions",
  "docsPath": "content/providers/01-ai-sdk-providers/190-fish-audio.mdx",
  "tables": [
    {
      "id": "fish-audio-speech",
      "capability": "speech",
      "columns": [
        [
          "Multi-Speaker",
          "multiSpeaker", value => value === "unknown" ? "Not declared" : value ? "<Check />" : "<Cross />"
        ],
        [
          "Loudness Normalization",
          "normalizeLoudness", value => value === "unknown" ? "Not declared" : value ? "<Check />" : "<Cross />"
        ],
        [
          "Instructions",
          "instructions"
        ]
      ]
    },
    {
      "id": "fish-audio-transcription",
      "capability": "transcription",
      "columns": [
        [
          "Transcription",
          "transcription"
        ],
        [
          "Streaming",
          "streaming"
        ],
        [
          "Duration",
          "duration"
        ],
        [
          "Segments",
          "segments"
        ],
        [
          "Language",
          "language"
        ]
      ]
    }
  ],
  "providerOptionTables": [
    {
      "id": "fish-audio-provider-options"
    }
  ]
};
