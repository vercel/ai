---
'@ai-sdk/assemblyai': patch
---

Update to latest AssemblyAI API: migrate from deprecated `speech_model` to `speech_models` array, add new transcription options (temperature, custom topics, prompt, keyterms, speaker options, language detection, speech understanding), expand response schema to cover the full transcript object, and expose raw provider metadata via `providerMetadata`.
