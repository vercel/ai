# Next.js + AI SDK Example

You can use the AI SDK in a [Next.js](https://nextjs.org/) app to build a streaming chat UI with persistence, SSR, and resumable streams.

This example demonstrates:

- Streaming assistant responses with `useChat`
- File-based chat persistence under `.chats/`
- Server-side rendering for existing chats
- Resume support for interrupted streams
- Message-level actions like regenerate and replace

## Usage

1. Create `.env.local` file with the following content:

```sh
VERCEL_API_KEY="YOUR_VERCEL_API_KEY"
VERCEL_OIDC_TOKEN="YOUR_VERCEL_OIDC_TOKEN"
REDIS_URL="YOUR_REDIS_URL"
```

2. Run the following commands from the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

3. Run the following command from the `examples/next` directory:

```sh
pnpm dev
```

4. Open the app in your browser:

```sh
http://localhost:3000
```

## What to expect

- Opening `/` starts a new chat session with a generated chat id.
- Messages stream in token-by-token from the model instead of appearing all at once.
- Sent messages are persisted and can be revisited at `/chat/<chatId>`.
- The chat page lists up to 5 recent chats.
- If you refresh during an active response, the app attempts to resume the stream.
- You can stop an in-progress stream and regenerate assistant output from a user message.

## Notes

- This is a minimal demo implementation. Chat persistence is file-based (`.chats/*.json`) instead of using a production database.
- `REDIS_URL` is required for resumable streams.
- `VERCEL_API_KEY` and `VERCEL_OIDC_TOKEN` are used for the model setup in this example.
