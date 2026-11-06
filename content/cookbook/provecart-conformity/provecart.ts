/**
 * ProveCart pre-payment check — shared client + verdict routing.
 *
 * Implements the consumer rules of the Agent Correction Format
 * (ACF v0.2, com.provecart.conformity):
 *   MATCH            -> proceed to payment.
 *   BLOCK + fixes    -> apply ONLY repairs that bring the cart INTO
 *                       the buyer's existing authorization, resubmit
 *                       as a new check carrying previous_record_id,
 *                       within max_attempts.
 *   REVIEW / unknown -> stop and escalate to the buyer. Never guess,
 *                       never widen the authorization.
 *
 * API: https://api.provecart.com, key in the X-API-Key header.
 *   POST /mandates {user_id, item_description, category,
 *     max_total_price, currency, max_quantity, expires_at, ...}
 *     -> signed mandate (use its "id")
 *   POST /verify {mandate_id, merchant, items, total_price, ...}
 *     -> {verdict, corrections[], max_attempts, record_id, ...}
 */
const BASE = "https://api.provecart.com";

export interface CartItem {
  name: string;
  quantity: number;
  unit_price: number;
  category?: string;
  brand?: string;
  variant?: string;
}

export interface VerifyResponse {
  verdict: "MATCH" | "REVIEW" | "BLOCK" | string;
  record_id?: string;
  max_attempts?: number;
  corrections?: Array<{ action?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

const KNOWN_ACTIONS = new Set([
  "remove_item", "replace_item", "change_variant", "reduce_quantity",
  "reduce_total", "change_currency", "correct_traveler_name",
  "change_airport", "change_travel_date", "change_departure_time",
  "add_itinerary", "rebuild_itinerary", "change_cabin",
  "change_fare_terms", "add_hotel_stay", "change_room",
  "change_provider", "change_location", "change_date", "change_time",
  "change_party_size", "correct_reservation_name", "reduce_deposit",
  "change_cancellation_terms",
]);

async function post(path: string, apiKey: string, body: unknown) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ProveCart ${path} failed: ${res.status}`);
  return res.json();
}

export async function createMandate(
  apiKey: string,
  instructions: Record<string, unknown>,
): Promise<{ id: string }> {
  return post("/mandates", apiKey, instructions);
}

export async function verifyCart(
  apiKey: string,
  args: {
    mandate_id: string;
    merchant: { name: string; domain: string };
    items: CartItem[];
    total_price: number;
    currency?: string;
    previous_record_id?: string;
  },
): Promise<VerifyResponse> {
  return post("/verify", apiKey, { currency: "USD", ...args });
}

export type Route =
  | { decision: "proceed"; record_id?: string }
  | { decision: "fix"; corrections: NonNullable<VerifyResponse["corrections"]>; record_id?: string; max_attempts?: number }
  | { decision: "escalate"; reason: string; record_id?: string };

export function routeVerdict(r: VerifyResponse): Route {
  if (r.verdict === "MATCH") return { decision: "proceed", record_id: r.record_id };
  if (r.verdict === "BLOCK") {
    const c = r.corrections ?? [];
    if (c.length > 0 && c.every((x) => x.action && KNOWN_ACTIONS.has(x.action))) {
      return { decision: "fix", corrections: c, record_id: r.record_id, max_attempts: r.max_attempts };
    }
    return { decision: "escalate", reason: "BLOCK without usable corrections", record_id: r.record_id };
  }
  return { decision: "escalate", reason: `verdict ${r.verdict} needs the buyer`, record_id: r.record_id };
}
