## background

Transcription model implementations were using `specificationVersion: 'v1'` while implementing the `TranscriptionModelV2` interface, causing type compatibility errors when providers expected v2 specification.

## summary

- update all transcription models to use v2 specification version
- create v2 transcription model type definitions

## verification

- type errors resolved for all transcription providers
- specification versions now match interface requirements

## tasks

- [x] update specificationVersion to 'v2' in all transcription model implementations
- [x] create v2 transcription model types and interfaces
- [x] update provider exports to use v2 types
