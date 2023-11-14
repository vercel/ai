---
title: experimental_StreamingReactResponse
layout:
  toc: false
---

# `experimental_StreamingReactResponse`

The `experimental_StreamingReactResponse` class allows you to stream React component responses.

<Callout>
  The `experimental_` prefix indicates that the API is not yet stable and may
  change in the future without a major version bump.

It is currently only implemented from `ai/react`'s `useChat` hook.

</Callout>

## `experimental_StreamingReactResponse(res: ReadableStream, options?: ResponseOptions): Response` [#streamingreactresponse]

The `experimental_StreamingReactResponse` class is designed to facilitate streaming React responses in a server action environment. It can handle and stream both raw content and data payloads, including special UI payloads, through nested promises.

## Parameters

### `res: ReadableStream`

This parameter should be a `ReadableStream`, which encapsulates the HTTP response's content. It represents the stream from which the response is read and processed.

### `options?: {ui?: Function, data?: experimental_StreamData}`

This optional parameter allows additional configurations for rendering React components and handling streamed data.

The options object can include:

- `ui?: (message: {content: string, data?: JSONValue[] | undefined}) => UINode | Promise<UINode>`: A function that receives a message object with `content` and optional `data` fields. This function should return a React component (as `UINode`) for each chunk in the stream. The `data` attribute in the message is available when the `data` option is configured to include stream data.
- `data?: experimental_StreamData`: An instance of `experimental_StreamData` used to process and stream data along with the response.

## Returns

The method returns a `Promise<ReactResponseRow>`, which resolves to the next row of the React response. Each row contains a payload with UI components (`ui`), raw content (`content`), and a `next` property pointing to the subsequent row or `null` if it's the last row. This setup allows for continuous streaming and rendering of data in a React-based UI.
