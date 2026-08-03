import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v6Sources } from '@/lib/geistdocs/source';

const llmsRoute = createLlmsRoute({ sources: v6Sources });

export const GET = llmsRoute.GET;
export const revalidate = false;
