import { tool } from 'ai';
import { z } from 'zod';

/**
 * ShopGraph product extraction tool.
 *
 * Calls the ShopGraph REST API to extract structured product data from a
 * commerce URL. Returns per-field confidence scores (0.0 to 1.0) so the
 * calling agent or UI can decide which fields to trust.
 *
 * Confidence scores reflect extraction method and source quality:
 * - 0.90+ : extracted from structured markup (Schema.org, JSON-LD)
 * - 0.70-0.89 : extracted via LLM from page content
 * - below 0.70 : inferred or partially matched, verify before using
 *
 * ShopGraph runs a three-tier pipeline (structured markup, LLM, headless
 * browser) and reconciles across tiers. The confidence score reflects
 * cross-tier agreement, not just one method's output probability.
 */
export const extractProduct = tool({
  description:
    'Extract structured product data with per-field confidence scores from a commerce URL. Returns product name, price, availability, brand, specifications, and more. Each field includes a confidence score (0.0 to 1.0) indicating extraction reliability.',
  parameters: z.object({
    url: z.string().url().describe('Product page URL to extract data from'),
  }),
  execute: async ({ url }) => {
    const response = await fetch('https://shopgraph.dev/api/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SHOPGRAPH_API_KEY}`,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        error: true,
        message: `Extraction failed (${response.status}): ${error}`,
        url,
      };
    }

    return response.json();
  },
});
