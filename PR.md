## background

Groq updated their model lineup with new production models and reorganized their API documentation. Our current model definitions were outdated and missing several newly available models.

## summary

- update groq model definitions to match current groq documentation
- reorganize model capabilities table by production/preview/legacy status

## verification

- groq package builds successfully
- all new model ids instantiate correctly
- documentation reflects current groq model availability

## tasks

- [x] model ids updated in groq-chat-options.ts
- [x] capabilities table reorganized by model status

## future work

- monitor groq model deprecations and update accordingly
