---
'@ai-sdk/openai': patch
---

Expose complete retrieved web-search URLs and file-search documents as sources, and normalize inline references separately as citations on text parts and text-end events. Preserve citation-derived sources when retrieval data is unavailable, including web-search-preview and Azure responses. Keep raw annotations, citation titles, and text locations available. Deduplicate file-search passages by file ID.
