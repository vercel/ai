import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/*
 * Load this package's own env files so record/live runs pick up credentials —
 * an AI_GATEWAY_API_KEY in `.env`, or (preferred for this suite) the
 * VERCEL_OIDC_TOKEN that's already present for sandbox provisioning, in
 * `.env.local`. Credentials live alongside the runner, not at the repo root.
 * `.env.local` is loaded first so it wins on conflicts (dotenv does not
 * override already-set vars). Pure replay needs no credential; missing files
 * are a no-op.
 */
config({ path: fileURLToPath(new URL('./.env.local', import.meta.url)) });
config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
