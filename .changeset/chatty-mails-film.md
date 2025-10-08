---
'@example/next-openai': patch
'@ai-sdk/provider': patch
'@example/ai-core': patch
'@ai-sdk/openai': patch
'@ai-sdk/azure': patch
'ai': patch
---

code interpreter enable download files.

- The client can receive the OpenAI annotation `container_file_citation` using the TextUIPart's providerMetadata.
- A third type, `SourceExecuteFile`, can be created in SourceUIPart to build a download UI that is independent of the text. ProviderMetadata for this purpose has also been defined.
- A zod object has been created that can parse the providerMetadata corresponding to each UIPart and extract the necessary information.
- Since the actual file download is performed via native fetching from OpenAI's official API, an example router.ts for Next.js has been created.
- Available in both `@ai-sdk/openai` and `@ai-sdk/azure`.
