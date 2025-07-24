# feat(codemods): add high-leverage v4→v5 migration codemods

## background

AI SDK v5 introduces several breaking API changes that require manual updates across all user codebases. The most common changes (`convertToCoreMessages`, `toDataStreamResponse`, `pipeDataStreamToResponse`, tool `parameters`) affect every project and create significant migration friction.

## summary

- add `convertToCoreMessages` → `convertToModelMessages` codemod
- add `toDataStreamResponse` → `toUIMessageStreamResponse` codemod  
- add `pipeDataStreamToResponse` → `pipeUIMessageStreamToResponse` codemod
- add tool `parameters` → `inputSchema` codemod

## verification

- all 4 codemods pass tests with realistic input/output fixtures
- build succeeds with no compilation errors
- integrated into upgrade bundle and auto-documented in README

## tasks

- [x] codemod implementations with proper AST transformations
- [x] test fixtures covering v4→v5 API changes  
- [x] integration with existing upgrade workflow
- [x] README auto-generation and documentation

## future work

- monitor user feedback for additional high-frequency migration patterns 