'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isStaticToolUIPart } from 'ai';
import { useState } from 'react';

interface ShopGraphProduct {
  product_name: string | null;
  brand: string | null;
  price: { amount: number; currency: string } | null;
  availability: string;
  confidence: { overall: number; per_field: Record<string, number> };
  _shopgraph: {
    field_confidence: Record<string, number>;
    extraction_method: string;
    data_source: string;
  };
  [key: string]: unknown;
}

interface ShopGraphResponse {
  product: ShopGraphProduct;
  cached: boolean;
  credit_mode: string;
}

function isShopGraphResponse(data: unknown): data is ShopGraphResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'product' in data &&
    typeof (data as ShopGraphResponse).product === 'object' &&
    (data as ShopGraphResponse).product !== null &&
    '_shopgraph' in (data as ShopGraphResponse).product
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const isLow = score < 0.85;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
        marginLeft: '0.5rem',
        backgroundColor: isLow
          ? 'rgba(217, 119, 6, 0.12)'
          : 'rgba(22, 163, 74, 0.12)',
        color: isLow ? 'rgb(180, 83, 9)' : 'rgb(22, 101, 52)',
      }}
    >
      {(score * 100).toFixed(0)}%{isLow ? ' — verify' : ''}
    </span>
  );
}

function ProductCard({ data }: { data: ShopGraphResponse }) {
  const product = data.product;
  const confidence = product._shopgraph.field_confidence;

  const displayFields = [
    { key: 'product_name', label: 'Product', value: product.product_name },
    { key: 'brand', label: 'Brand', value: product.brand },
    {
      key: 'price',
      label: 'Price',
      value: product.price
        ? `${product.price.currency} ${product.price.amount.toFixed(2)}`
        : null,
    },
    { key: 'availability', label: 'Availability', value: product.availability },
  ];

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginTop: '0.5rem',
        maxWidth: '32rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          marginBottom: '0.75rem',
          display: 'flex',
          gap: '1rem',
        }}
      >
        <span>
          Overall confidence: {(product.confidence.overall * 100).toFixed(0)}%
        </span>
        <span>Method: {product._shopgraph.extraction_method}</span>
        <span>{data.cached ? 'Cached' : 'Live'}</span>
      </div>

      {displayFields.map(({ key, label, value }) => {
        if (value === null || value === 'unknown') return null;
        const conf = confidence[key] ?? 0;
        const isLow = conf < 0.85;

        return (
          <div
            key={key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '0.375rem 0',
              borderBottom: '1px solid #f3f4f6',
              color: isLow ? 'rgb(180, 83, 9)' : 'inherit',
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                {label}
              </span>
              <div
                style={{
                  fontSize: '0.875rem',
                  maxWidth: '20rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {String(value)}
              </div>
            </div>
            <ConfidenceBadge score={conf} />
          </div>
        );
      })}
    </div>
  );
}

export default function Page() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  return (
    <div
      style={{
        maxWidth: '40rem',
        margin: '0 auto',
        padding: '2rem 1rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1
        style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}
      >
        Product Extraction with Confidence Scoring
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map(message => (
          <div key={message.id}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#6b7280',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
              }}
            >
              {message.role}
            </div>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <div
                    key={index}
                    style={{ fontSize: '0.875rem', lineHeight: 1.6 }}
                  >
                    {part.text}
                  </div>
                );
              }
              if (isStaticToolUIPart(part)) {
                const result = part.result;
                if (isShopGraphResponse(result)) {
                  return <ProductCard key={index} data={result} />;
                }
                return (
                  <pre
                    key={index}
                    style={{
                      fontSize: '0.75rem',
                      background: '#f9fafb',
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </pre>
                );
              }
              return null;
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput('');
        }}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1rem',
          background: 'white',
          borderTop: '1px solid #e5e7eb',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Paste a product URL to extract data..."
          style={{
            width: '100%',
            maxWidth: '40rem',
            margin: '0 auto',
            display: 'block',
            padding: '0.75rem',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
      </form>
    </div>
  );
}
