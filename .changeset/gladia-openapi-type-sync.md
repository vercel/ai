---
'@ai-sdk/gladia': patch
---

Add Gladia v2 `languageConfig`, PII redaction, translation options (including the `batch` model), audio-to-LLM model selection, and transcription model IDs. Keep legacy options compatible: translate language and vocabulary aliases with deprecation warnings and warn when obsolete options are ignored. Preserve selected model IDs in responses and workflow serialization, and validate options before audio upload. The registry-facing `transcriptionModel(id)` alias now forwards non-default IDs; `default` still lets Gladia choose its model.
