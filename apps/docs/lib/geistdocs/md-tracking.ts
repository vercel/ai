import type { TrackMarkdownRequestEvent } from '@vercel/geistdocs/proxy';
import { siteId } from '@/geistdocs';

const PLATFORM_URL = 'https://geistdocs.com/md-tracking';

/** Track a markdown page request via the Geistdocs platform. */
export const trackMdRequest = async (
  event: TrackMarkdownRequestEvent,
): Promise<void> => {
  try {
    const response = await fetch(PLATFORM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        siteId,
      }),
    });

    if (!response.ok) {
      console.error('MD tracking failed:', response.status);
    }
  } catch (error) {
    console.error('MD tracking error:', error);
  }
};
