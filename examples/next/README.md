# Next.js Chat Example

A minimal Next.js example for testing chat persistence, server-side rendering,
file attachments, and resumable streams.

## Setup

Install dependencies from the repository root:

```bash
pnpm install
```

Copy the example environment file:

```bash
cp examples/next/.env.local.example examples/next/.env.local
```

Then fill in the values you need:

- `VERCEL_API_KEY` and `VERCEL_OIDC_TOKEN` are used by Vercel-backed flows.
- `BLOB_READ_WRITE_TOKEN` is required when testing external file attachments
  with Vercel Blob.
- `REDIS_URL` is required for resumable streams. You can create a Redis store
  from the Vercel Marketplace.

## Run Locally

Start the development server from this example directory:

```bash
cd examples/next
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Local Data

This example stores chat data in a local `.chats` directory for demo purposes.
The directory is created automatically when you start using the app and is not
intended for production persistence.
