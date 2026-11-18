/**
 * Example: a shopping agent whose checkout is gated by ProveCart.
 *
 * The agent may only capture payment when the check returns MATCH.
 * A BLOCK with in-authorization corrections loops back through the
 * agent's cart builder; anything else escalates to the buyer.
 *
 * Run: PROVECART_API_KEY=ifk_... npx tsx check-cart-before-payment.ts
 */
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createMandate, routeVerdict, verifyCart } from "./provecart";

const apiKey = process.env.PROVECART_API_KEY;
if (!apiKey) throw new Error("set PROVECART_API_KEY (your integrator key)");

export const checkCartBeforePayment = tool({
  description:
    "Check a built cart against the customer's signed instructions " +
    "with ProveCart before payment. Returns proceed, fix (with the " +
    "exact corrections to apply), or escalate (ask the buyer).",
  inputSchema: z.object({
    mandateId: z.string(),
    merchant: z.object({ name: z.string(), domain: z.string() }),
    items: z.array(z.object({
      name: z.string(), quantity: z.number(), unit_price: z.number(),
    })),
    totalPrice: z.number(),
  }),
  execute: async ({ mandateId, merchant, items, totalPrice }) => {
    const res = await verifyCart(apiKey, {
      mandate_id: mandateId, merchant, items, total_price: totalPrice,
    });
    return routeVerdict(res);
  },
});

async function main() {
  // The customer's signed instructions, captured at order time.
  const mandate = await createMandate(apiKey!, {
    user_id: "buyer-123",
    item_description: "LG washing machine",
    item_keywords: ["lg", "washing", "machine"],
    category: "appliances",
    max_total_price: 985.21,
    currency: "USD",
    max_quantity: 1,
    brand: "LG",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  });

  const { text } = await generateText({
    model: openai("gpt-5"),
    tools: { checkCartBeforePayment },
    prompt:
      `Buy the LG washing machine for mandate ${mandate.id} at ` +
      `Benchmark Shop (shop.example.com); keep the total under ` +
      `$985.21. Before paying, call checkCartBeforePayment. Only ` +
      `report success if it returns "proceed"; if it returns "fix", ` +
      `say which corrections it named; if "escalate", say the buyer ` +
      `must decide.`,
  });
  console.log(text);
}

main().catch((e) => { console.error(e); process.exit(1); });
