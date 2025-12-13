import {
  createProviderDefinedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * A provider-defined tool that enables Grounding with Google Maps.
 *
 * @see https://ai.google.dev/gemini-api/docs/maps-grounding
 */
export const googleMaps = createProviderDefinedToolFactory<
  {},
  {
    /**
     * Enables returning the googleMapsWidgetContextToken in the response.
     */
    enableWidget?: boolean;
    /**
     * Provides contextual location hints for the request.
     */
    retrievalConfig?: {
      latLng?: {
        latitude: number;
        longitude: number;
      };
      [key: string]: unknown;
    };
  }
>({
  id: 'google.google_maps',
  name: 'google_maps',
  inputSchema: lazySchema(() =>
    zodSchema(
      z
        .object({
          enableWidget: z.boolean().optional(),
          retrievalConfig: z
            .object({
              latLng: z
                .object({
                  latitude: z.number(),
                  longitude: z.number(),
                })
                .optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
  ),
});
