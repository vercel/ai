import { createLlmsRoute } from '@vercel/geistdocs/routes/llms';
import { v7Sources } from '@/lib/geistdocs/source';

const llmsRoute = createLlmsRoute({ sources: v7Sources });

export const GET = llmsRoute.GET;
export const revalidate = false;
