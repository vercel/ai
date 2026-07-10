---
'@ai-sdk/amazon-transcribe': major
---

feat (provider/amazon-transcribe): add Amazon Transcribe provider with batch transcription support

Adds a new `@ai-sdk/amazon-transcribe` provider that implements the AI SDK
`transcribe` function using the Amazon Transcribe batch transcription API. The
provider uploads the audio to a configured S3 bucket (`providerOptions.amazonTranscribe.inputBucket`),
starts a transcription job, polls until completion, and returns the transcript,
segments, language, and duration. Authentication uses AWS SigV4.
