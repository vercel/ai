# AI SDK - Amazon Transcribe Provider

The **[Amazon Transcribe provider](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-transcribe)** for the [AI SDK](https://ai-sdk.dev/docs) contains transcription model support for the [Amazon Transcribe](https://aws.amazon.com/transcribe/) batch transcription API.

> Amazon Transcribe is a separate AWS service from Amazon Bedrock. Batch transcription reads audio from (and optionally writes the transcript to) Amazon S3. Because the AI SDK `transcribe` function provides raw audio bytes, this provider uploads the audio to a configured S3 bucket before starting the job, then polls until it completes.

## Setup

The Amazon Transcribe provider is available in the `@ai-sdk/amazon-transcribe` module. You can install it with

```bash
npm i @ai-sdk/amazon-transcribe
```

## Provider Instance

You can import the default provider instance `amazonTranscribe` from `@ai-sdk/amazon-transcribe`:

```ts
import { amazonTranscribe } from '@ai-sdk/amazon-transcribe';
```

## Example

```ts
import { amazonTranscribe } from '@ai-sdk/amazon-transcribe';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';

const { text } = await transcribe({
  model: amazonTranscribe.transcription(),
  audio: await readFile('audio.mp3'),
  providerOptions: {
    amazonTranscribe: {
      inputBucket: 'my-audio-bucket',
      languageCode: 'en-US',
    },
  },
});
```

## Documentation

Please check out the **[Amazon Transcribe provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-transcribe)** for more information.
