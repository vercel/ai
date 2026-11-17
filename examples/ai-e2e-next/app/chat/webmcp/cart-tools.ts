import type { WebMCPModelContext, WebMCPTool } from '@ai-sdk/mcp';
import { z } from 'zod/v4';

export const products = [
  {
    id: 't-shirt',
    name: 'Cotton T-shirt',
    price: 25,
    detail: 'A softer everyday staple.',
    color: 'bg-[#e8e9df]',
  },
  {
    id: 'tote',
    name: 'Canvas tote',
    price: 18,
    detail: 'Room for the daily essentials.',
    color: 'bg-[#e9dfd3]',
  },
  {
    id: 'mug',
    name: 'Ceramic mug',
    price: 12,
    detail: 'For slower mornings.',
    color: 'bg-[#dce5e8]',
  },
] as const;

export type ProductId = (typeof products)[number]['id'];
export type Cart = Record<ProductId, number>;
export const initialCart: Cart = { 't-shirt': 1, tote: 0, mug: 0 };

export type PageModelContext = WebMCPModelContext & {
  registerTool(
    tool: Omit<WebMCPTool, 'origin' | 'window'> & {
      execute: (input: unknown) => Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ): Promise<void>;
};

const productIdSchema = z.enum(['t-shirt', 'tote', 'mug']);
const quantitySchema = z.number().int().min(0).max(20);
const itemSchema = z.object({ productId: productIdSchema });
const updateSchema = itemSchema.extend({ quantity: quantitySchema });
const addSchema = itemSchema.extend({ quantity: quantitySchema.min(1) });

export function setCartQuantity(
  cart: Cart,
  productId: ProductId,
  quantity: number,
): Cart {
  return { ...cart, [productId]: quantitySchema.parse(quantity) };
}

export function getCartSnapshot(cart: Cart) {
  const items = products
    .filter(product => cart[product.id] > 0)
    .map(({ id, name, price }) => ({
      productId: id,
      name,
      unitPrice: price,
      quantity: cart[id],
    }));
  return {
    items,
    total: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    currency: 'USD',
    catalog: products.map(({ id, name, price }) => ({
      productId: id,
      name,
      price,
    })),
  };
}

export async function registerCartTools(
  modelContext: PageModelContext,
  read: () => Cart,
  write: (cart: Cart) => void,
  signal: AbortSignal,
) {
  const update = (productId: ProductId, quantity: number) => {
    const cart = setCartQuantity(read(), productId, quantity);
    write(cart);
    return getCartSnapshot(cart);
  };

  const tools = [
    {
      name: 'getCart',
      description:
        'Read the current shopping cart, its total in USD, and the available product catalog.',
      inputSchema: z.toJSONSchema(z.object({})),
      annotations: { readOnlyHint: true },
      execute: async () => getCartSnapshot(read()),
    },
    {
      name: 'addToCart',
      description:
        'Add a quantity of a catalog product to the cart. Each product can have at most 20 units.',
      inputSchema: z.toJSONSchema(addSchema),
      execute: async (input: unknown) => {
        const { productId, quantity } = addSchema.parse(input);
        return update(productId, read()[productId] + quantity);
      },
    },
    {
      name: 'updateCartItem',
      description:
        'Set a product quantity in the cart to an exact number, from 0 to 20. Zero removes it.',
      inputSchema: z.toJSONSchema(updateSchema),
      execute: async (input: unknown) => {
        const { productId, quantity } = updateSchema.parse(input);
        return update(productId, quantity);
      },
    },
    {
      name: 'removeFromCart',
      description: 'Remove all units of a product from the cart.',
      inputSchema: z.toJSONSchema(itemSchema),
      execute: async (input: unknown) =>
        update(itemSchema.parse(input).productId, 0),
    },
  ];

  await Promise.all(
    tools.map(tool => modelContext.registerTool(tool, { signal })),
  );
  console.log(
    '[WebMCP] Browser tools registered',
    tools.map(tool => tool.name),
  );
}
