import { createNotFoundRoute } from '@vercel/geistdocs/routes/not-found';
import { config } from '@/lib/geistdocs/config';

// Backstop for unmatched application paths: agents and Markdown requests
// receive a Markdown 404 with discovery links; browsers receive a plain HTML
// 404. createProxy's route-manifest recovery handles most cases upstream.
export const { GET } = createNotFoundRoute({ config });
