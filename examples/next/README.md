# Next.js + AI SDK Example

A minimal [Next.js](https://nextjs.org/) example that demonstrates three features of the AI SDK together: chat persistence, server-side rendering, and resumable streams.

## What this example demonstrates

- **Persistence**: chat history is stored on the server via a file-backed `chat-store`, so a refresh does not lose state.
- **SSR**: existing chat history is rendered server-side at first paint, then hydrated on the client.
- **Resumable streams**: an in-flight model response can be resumed from another tab or after a disconnect, via a Redis-backed resumable-stream context.

The example uses `openai/gpt-5-mini` through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), so no direct OpenAI key is required.

## Usage

1. From the root of the AI SDK repo, install dependencies and build the workspace:

```sh
pnpm install
pnpm build
```

2. Create `.env.local` inside `examples/next/`:

```sh
# Required — Vercel AI Gateway credentials for the model call
VERCEL_API_KEY=""

# Optional — needed only to test the resumable-stream path.
# Provision via https://vercel.com/marketplace/redis
REDIS_URL=""

# Optional — needed only to test attachment uploads.
# Provision via https://vercel.com/docs/storage/vercel-blob
BLOB_READ_WRITE_TOKEN=""
```

If you are running the example inside a Vercel deployment, `VERCEL_OIDC_TOKEN` can substitute for `VERCEL_API_KEY`.

3. From `examples/next/`, run the dev server:

```sh
pnpm dev
```

4. Open http://localhost:3000 in a browser.

## Testing the features

- **Persistence**: send a message, refresh the page — the conversation survives.
- **SSR**: in DevTools → Network → view the initial document HTML; rendered messages appear in the source before client hydration.
- **Resumable streams** (requires `REDIS_URL`): send a long message, then open the same chat URL in a second tab — the in-flight stream resumes there.

## Requirements

- Node.js `^22.0.0 || ^24.0.0 || ^26.0.0`
- `pnpm@10.x` (see `packageManager` in the root `package.json`)
