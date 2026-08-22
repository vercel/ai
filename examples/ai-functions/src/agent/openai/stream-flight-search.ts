import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

// Uses the Ignav flight API (https://ignav.com); set IGNAV_API_KEY in .env.
const apiKey = process.env.IGNAV_API_KEY ?? '';

if (!apiKey) {
  throw new Error('Set IGNAV_API_KEY to run this example.');
}

const apiBaseUrl = 'https://ignav.com/api';

type Price = {
  amount: number;
  currency: string;
};

type Segment = {
  marketing_carrier_code: string | null;
  flight_number: string | null;
  departure_airport: string;
  departure_time_local: string;
  arrival_airport: string;
  arrival_time_local: string;
};

type Itinerary = {
  price: Price;
  outbound: {
    carrier: string | null;
    duration_minutes: number | null;
    segments: Segment[];
  };
  ignav_id: string;
};

type FareSearchResponse = {
  origin: string;
  destination: string;
  departure_date: string;
  itineraries: Itinerary[];
};

type BookingLinksResponse = {
  booking_options: Array<{
    legs: string[];
    links: Array<{
      provider_name: string;
      provider_type: 'airline' | 'third_party';
      fare_name: string | null;
      price: Price | null;
      url: string;
    }>;
  }>;
};

async function postFlightApi<Response>(
  path: string,
  body: unknown,
): Promise<Response> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Flight API request failed: ${response.status} ${await response.text()}`,
    );
  }

  return (await response.json()) as Response;
}

const searchOneWayFlights = tool({
  description:
    'Search one-way flight fares. Return ignav_id values so booking links can be fetched for selected itineraries.',
  inputSchema: z.object({
    origin: z
      .string()
      .length(3)
      .describe('Origin airport IATA code, for example SFO.'),
    destination: z
      .string()
      .length(3)
      .describe('Destination airport IATA code, for example JFK.'),
    departureDate: z.string().describe('Departure date in YYYY-MM-DD format.'),
  }),
  execute: async ({ origin, destination, departureDate }) => {
    const result = await postFlightApi<FareSearchResponse>('/fares/one-way', {
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departure_date: departureDate,
    });

    return {
      origin: result.origin,
      destination: result.destination,
      departureDate: result.departure_date,
      itineraries: result.itineraries.slice(0, 3).map(itinerary => {
        const firstSegment = itinerary.outbound.segments[0];
        const lastSegment =
          itinerary.outbound.segments[itinerary.outbound.segments.length - 1];

        return {
          ignav_id: itinerary.ignav_id,
          price: itinerary.price,
          carrier: itinerary.outbound.carrier,
          duration_minutes: itinerary.outbound.duration_minutes,
          stops: Math.max(0, itinerary.outbound.segments.length - 1),
          departure: {
            airport: firstSegment?.departure_airport,
            time: firstSegment?.departure_time_local,
          },
          arrival: {
            airport: lastSegment?.arrival_airport,
            time: lastSegment?.arrival_time_local,
          },
          flights: itinerary.outbound.segments.map(segment => ({
            carrier: segment.marketing_carrier_code,
            flight_number: segment.flight_number,
          })),
        };
      }),
    };
  },
});

const getBookingLinks = tool({
  description:
    'Get booking URLs for an itinerary. Call this with an ignav_id from searchOneWayFlights.',
  inputSchema: z.object({
    ignavId: z.string().describe('The ignav_id returned by a fare search.'),
  }),
  execute: async ({ ignavId }) => {
    const result = await postFlightApi<BookingLinksResponse>(
      '/fares/booking-links',
      { ignav_id: ignavId },
    );

    return {
      booking_options: result.booking_options.map(option => ({
        legs: option.legs,
        links: option.links.map(link => ({
          provider: link.provider_name,
          provider_type: link.provider_type,
          fare_name: link.fare_name,
          price: link.price,
          url: link.url,
        })),
      })),
    };
  },
});

const agent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions:
    'Search fares first, then call getBookingLinks for the itinerary you recommend. Include the exact booking URL and remind the user to verify the final price and rules before purchase.',
  tools: {
    searchOneWayFlights,
    getBookingLinks,
  },
});

run(async () => {
  const result = await agent.stream({
    prompt:
      'Find a one-way flight from SFO to JFK on 2026-07-15 and include a booking URL for the best option.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
