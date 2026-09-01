---
title: uploadFile
description: API Reference for uploadFile.
---

# `uploadFile()`

Uploads a file to a provider and returns a `ProviderReference` that can be used in
subsequent API calls, such as in message content parts passed to `generateText` or
`streamText`.

```ts
import { uploadFile } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'node:fs';

const { providerReference } = await uploadFile({
  api: openai.files(),
  data: fs.readFileSync('./photo.png'),
  filename: 'photo.png',
});
```

## Import

<Snippet text={`import { uploadFile } from "ai"`} prompt={false} />

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: 'api',
      type: 'FilesV4 | ProviderV4',
      description:
        'The files API interface to use for uploading. Can be a `FilesV4` instance (e.g. `openai.files()`) or a provider instance directly (e.g. `openai`), in which case `.files()` is called automatically.',
    },
    {
      name: 'data',
      type: 'DataContent | { type: "stream"; stream: ReadableStream<Uint8Array> }',
      description:
        'The file data to upload. Can be a `Uint8Array`, a base64-encoded string, an `ArrayBuffer`, a `Buffer`, or a tagged `{ type: "stream", stream }` shape for providers that support streaming uploads (sent without buffering; other providers reject with an `UnsupportedFunctionalityError`). The provider consumes the stream — any failed upload (including validation failures before a request is made) cancels it, and it must not be reused. URLs are not supported — fetch the content first and pass the bytes.',
    },
    {
      name: 'mediaType',
      type: 'string',
      isOptional: true,
      description:
        'IANA media type of the file (e.g. `image/png`, `application/pdf`). Auto-detected from the file bytes if not provided; stream data cannot be sniffed and defaults to `application/octet-stream`.',
    },
    {
      name: 'filename',
      type: 'string',
      isOptional: true,
      description:
        'Filename for the uploaded file. Multipart-based providers default it to `"blob"` when omitted.',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: 'Signal to cancel the upload.',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description: 'Additional HTTP headers to send with the request.',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description:
        'Additional provider-specific options. For example, OpenAI requires a `purpose` field.',
    },
  ]}
/>

### Returns

<PropertiesTable
  content={[
    {
      name: 'providerReference',
      type: 'ProviderReference',
      description:
        'A `Record<string, string>` mapping provider names to provider-specific file identifiers. Pass this as the `data` or `image` field in message content parts.',
    },
    {
      name: 'byteSize',
      type: 'number',
      isOptional: true,
      description:
        'Size of the uploaded file in bytes, if reported by the provider.',
    },
    {
      name: 'createdAt',
      type: 'Date',
      isOptional: true,
      description: 'When the file was created, if reported by the provider.',
    },
    {
      name: 'expiresAt',
      type: 'Date',
      isOptional: true,
      description:
        'When the provider will delete the file (retention expiry, e.g. from a requested upload TTL), if reported by the provider.',
    },
    {
      name: 'providerMetadata',
      type: 'ProviderMetadata',
      isOptional: true,
      description:
        'Additional provider-specific metadata returned from the upload.',
    },
    {
      name: 'warnings',
      type: 'Warning[]',
      description: 'Warnings from the provider (e.g. unsupported settings).',
    },
  ]}
/>
