'use client';

import {
  ArrowUp,
  Check,
  Coffee,
  Minus,
  Plus,
  ShoppingBag,
  Shirt,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { products, type ProductId } from './cart-tools';
import { useCartAgent } from './use-cart-agent';

const icons = { 't-shirt': Shirt, tote: ShoppingBag, mug: Coffee };
const toolLabels: Record<string, string> = {
  getCart: 'Read cart',
  addToCart: 'Add item',
  updateCartItem: 'Update quantity',
  removeFromCart: 'Remove item',
};
const suggestions = [
  'What’s in my cart?',
  'Add two mugs',
  'What can I get for $40?',
];
const money = (amount: number) => `$${amount.toFixed(2)}`;

export default function WebMCPChat() {
  const {
    cart,
    setQuantity,
    messages,
    sendMessage,
    status,
    error,
    ready,
    setupError,
  } = useCartAgent();
  const [input, setInput] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const element = conversation.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  function send(text: string) {
    if (!ready || busy || !text.trim()) return;
    setInput('');
    void sendMessage({ text: text.trim() });
  }

  function quantityFor(id: ProductId) {
    return cart.items.find(item => item.productId === id)?.quantity ?? 0;
  }

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-[#252923] selection:bg-[#dce7c8]">
      <header className="border-b border-black/10 bg-white/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <Link
            href="/chat/webmcp"
            className="flex items-center gap-2 text-sm font-bold tracking-[0.2em]"
          >
            <ShoppingBag
              className="size-5"
              strokeWidth={1.6}
              aria-hidden="true"
            />{' '}
            FIELDWORK
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-9 max-w-xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            The everyday collection
          </p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
            Good things. Less effort.
          </h1>
          <p className="mt-4 leading-relaxed text-stone-500">
            Browse a little. Ask a question. Build your cart with a helping
            hand.
          </p>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
          <section aria-label="Shop and cart" className="space-y-8">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3">
              {products.map(product => {
                const Icon = icons[product.id];
                const quantity = quantityFor(product.id);
                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-black/5 bg-white"
                  >
                    <div
                      className={`flex h-36 items-center justify-center ${product.color}`}
                    >
                      <Icon
                        className="size-16 text-[#4d5544]"
                        strokeWidth={1}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="p-4">
                      <div className="min-h-20">
                        <h2 className="text-sm font-semibold">
                          {product.name}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">
                          {product.detail}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {money(product.price)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add ${product.name}`}
                          disabled={quantity >= 20}
                          onClick={() => setQuantity(product.id, quantity + 1)}
                          className="rounded-full border border-stone-200 p-2 transition hover:border-stone-400 hover:bg-stone-50 disabled:opacity-30"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <section
              aria-labelledby="cart-heading"
              className="rounded-2xl border border-black/5 bg-white p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 id="cart-heading" className="font-serif text-2xl">
                  Your cart{' '}
                  <span className="ml-1 font-sans text-sm text-stone-400">
                    ({itemCount})
                  </span>
                </h2>
                <span className="text-xs text-stone-400">Updates live</span>
              </div>
              {cart.items.length === 0 && (
                <p className="py-7 text-center text-sm text-stone-500">
                  A little room for something good.
                </p>
              )}
              <ul className="divide-y divide-stone-100">
                {cart.items.map(item => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center gap-3 py-4"
                  >
                    <div className="min-w-28 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="mt-1 text-xs text-stone-400">
                        {money(item.unitPrice)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-full border border-stone-200 px-2 py-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name} quantity`}
                        onClick={() =>
                          setQuantity(item.productId, item.quantity - 1)
                        }
                        className="rounded-full p-1 hover:bg-stone-100"
                      >
                        <Minus className="size-3" aria-hidden="true" />
                      </button>
                      <span
                        aria-label={`${item.name} quantity`}
                        className="min-w-3 text-center text-xs tabular-nums"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase ${item.name} quantity`}
                        disabled={item.quantity >= 20}
                        onClick={() =>
                          setQuantity(item.productId, item.quantity + 1)
                        }
                        className="rounded-full p-1 hover:bg-stone-100 disabled:opacity-30"
                      >
                        <Plus className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="w-14 text-right text-sm tabular-nums">
                      {money(item.unitPrice * item.quantity)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => setQuantity(item.productId, 0)}
                      className="rounded-lg p-2 text-stone-400 hover:bg-stone-50 hover:text-stone-800"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-5">
                <span className="text-sm font-medium">
                  Subtotal{' '}
                  <span className="font-normal text-stone-400">· USD</span>
                </span>
                <span
                  aria-label="Cart subtotal"
                  className="text-xl font-semibold tabular-nums"
                >
                  {money(cart.total)}
                </span>
              </div>
            </section>
          </section>

          <section
            aria-labelledby="assistant-heading"
            className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"
          >
            <div className="flex items-center gap-3 border-b border-stone-100 px-6 py-5">
              <span className="rounded-xl bg-[#eef2e8] p-2.5">
                <Sparkles
                  className="size-4 text-[#536340]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h2 id="assistant-heading" className="text-sm font-semibold">
                  Your shopping companion
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-400">
                  <span
                    className={`size-1.5 rounded-full ${ready ? 'bg-[#6c8056]' : 'bg-stone-300'}`}
                  />
                  {ready ? 'Here to help' : 'Connecting…'}
                </p>
              </div>
            </div>

            <div
              ref={conversation}
              className="h-[420px] space-y-5 overflow-y-auto px-6 py-6"
              aria-live="polite"
              aria-label="Conversation"
            >
              {messages.length === 0 && (
                <div className="pt-10">
                  <p className="font-serif text-2xl">Make yourself at home.</p>
                  <p className="mt-3 text-sm leading-6 text-stone-500">
                    I can read your cart, add something new, change quantities,
                    or help you choose. What are you looking for?
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {suggestions.map(text => (
                      <button
                        key={text}
                        type="button"
                        disabled={!ready || busy}
                        onClick={() => send(text)}
                        className="rounded-full border border-stone-200 px-3 py-2 text-xs text-stone-600 transition hover:border-[#9ba98a] hover:bg-[#f7f9f3] disabled:opacity-40"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(message => (
                <div
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-8 rounded-2xl rounded-tr-sm bg-[#eef2e8] px-4 py-3'
                      : 'mr-3'
                  }
                >
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                    {message.role === 'user' ? 'You' : 'Fieldwork'}
                  </p>
                  {message.parts.map((part, index) => {
                    if (part.type === 'text')
                      return (
                        <div
                          key={index}
                          className="prose prose-sm max-w-none text-sm leading-6"
                        >
                          <ReactMarkdown>{part.text}</ReactMarkdown>
                        </div>
                      );
                    if (part.type === 'dynamic-tool')
                      return (
                        <p
                          key={part.toolCallId}
                          className={`my-2 flex items-center gap-1.5 text-xs ${part.state === 'output-error' ? 'text-red-700' : 'text-[#6c8056]'}`}
                        >
                          <Check className="size-3" aria-hidden="true" />
                          {toolLabels[part.toolName] ?? 'Cart action'}
                          {part.state === 'output-error'
                            ? `: ${part.errorText}`
                            : part.state === 'output-available'
                              ? ' · done'
                              : '…'}
                        </p>
                      );
                    return null;
                  })}
                </div>
              ))}
              {busy && (
                <p role="status" className="text-xs text-stone-400">
                  Working on your request…
                </p>
              )}
            </div>

            <div className="border-t border-stone-100 p-4">
              {setupError && (
                <p
                  role="alert"
                  className="mb-3 text-xs leading-5 text-amber-800"
                >
                  {setupError}
                </p>
              )}
              {error && (
                <p role="alert" className="mb-3 text-xs text-red-700">
                  {error.message}
                </p>
              )}
              <form
                onSubmit={event => {
                  event.preventDefault();
                  send(input);
                }}
                className="flex items-end gap-2 rounded-xl border border-stone-200 bg-[#fafaf8] p-2 focus-within:border-[#9ba98a]"
              >
                <textarea
                  aria-label="Message"
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ask anything about the shop…"
                  rows={2}
                  disabled={!ready || busy}
                  className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-stone-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!ready || busy || !input.trim()}
                  className="rounded-lg bg-[#34432c] p-2.5 text-white transition hover:bg-[#475a3b] disabled:opacity-30"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
              </form>
              <p className="mt-2 text-center text-[10px] text-stone-400">
                Your cart, your call. Ask for a change or make it yourself.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
