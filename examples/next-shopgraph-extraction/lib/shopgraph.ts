import { tool } from 'ai';
import { z } from 'zod';

interface ShopGraphPrice {
  amount: number;
  currency: string;
  sale_price?: number;
}

interface ShopGraphFieldFreshness {
  volatility_class: string;
  age_seconds: number;
  decayed: boolean;
  original_confidence?: number;
}

interface ShopGraphMetadata {
  source_url: string;
  extraction_timestamp: string;
  response_timestamp: string;
  extraction_method: string;
  data_source: 'live' | 'cache';
  field_confidence: Record<string, number>;
  field_freshness: Record<string, ShopGraphFieldFreshness>;
  confidence_method: string;
}

interface ShopGraphProduct {
  url: string;
  extracted_at: string;
  extraction_method: 'schema_org' | 'llm' | 'hybrid';
  product_name: string | null;
  brand: string | null;
  description: string | null;
  price: ShopGraphPrice | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  categories: string[];
  image_urls: string[];
  primary_image_url: string | null;
  color: string[];
  material: string[];
  dimensions: Record<string, string> | null;
  confidence: {
    overall: number;
    per_field: Record<string, number>;
  };
  _shopgraph: ShopGraphMetadata;
}

interface ShopGraphResponse {
  product: ShopGraphProduct;
  cached: boolean;
  credit_mode: string;
}

/**
 * Maps product fields to their confidence scores from the _shopgraph metadata,
 * returning a combined view of data and confidence for each field.
 */
function mapFieldsWithConfidence(product: ShopGraphProduct) {
  const meta = product._shopgraph;
  const fieldConfidence = meta.field_confidence;

  const fields: Record<
    string,
    { value: unknown; confidence: number; decayed: boolean }
  > = {};

  const fieldMap: Record<string, unknown> = {
    product_name: product.product_name,
    brand: product.brand,
    description: product.description,
    price: product.price
      ? `${product.price.amount} ${product.price.currency}`
      : null,
    availability: product.availability,
    categories: product.categories,
    primary_image_url: product.primary_image_url,
    material: product.material,
    dimensions: product.dimensions,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    const confidenceKey = key === 'price' ? 'price' : key;
    const confidence = fieldConfidence[confidenceKey] ?? 0;
    const freshness = meta.field_freshness?.[confidenceKey];
    const decayed = freshness?.decayed ?? false;

    fields[key] = { value, confidence, decayed };
  }

  return fields;
}

export const extractProduct = tool({
  description:
    'Extracts authenticated product data from a commerce URL. Returns product details and per-field confidence scores (0.0 to 1.0). You must check the confidence score for every field. If a field\'s confidence is below 0.85, you must explicitly flag to the user that the data requires verification.',
  parameters: z.object({
    url: z.string().url().describe('The product URL to extract data from'),
  }),
  execute: async ({ url }) => {
    const response = await fetch('https://shopgraph.dev/api/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SHOPGRAPH_API_KEY}`,
      },
      body: JSON.stringify({ url, format: 'json' }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        error: `ShopGraph API returned ${response.status}: ${text}`,
      };
    }

    const data: ShopGraphResponse = await response.json();
    const product = data.product;
    const fields = mapFieldsWithConfidence(product);

    return {
      product_name: product.product_name,
      brand: product.brand,
      description: product.description,
      price: product.price,
      availability: product.availability,
      categories: product.categories,
      primary_image_url: product.primary_image_url,
      material: product.material,
      dimensions: product.dimensions,
      extraction_method: product._shopgraph.extraction_method,
      data_source: product._shopgraph.data_source,
      overall_confidence: product.confidence.overall,
      fields_with_confidence: fields,
      cached: data.cached,
    };
  },
});
