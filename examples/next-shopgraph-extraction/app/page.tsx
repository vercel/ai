'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isStaticToolUIPart } from 'ai';
import { useState } from 'react';

interface FieldWithConfidence {
  value: unknown;
  confidence: number;
  decayed: boolean;
}

interface ExtractionResult {
  product_name: string | null;
  brand: string | null;
  price: { amount: number; currency: string } | null;
  availability: string;
  overall_confidence: number;
  fields_with_confidence: Record<string, FieldWithConfidence>;
  [key: string]: unknown;
}

function isExtractionResult(data: unknown): data is ExtractionResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    'fields_with_confidence' in data &&
    'overall_confidence' in data
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
      {(score * 100).toFixed(0)}%{isLow ? ' — verification recommended' : ''}
    </span>
  );
}

function ProductCard({ data }: { data: ExtractionResult }) {
  const fields = data.fields_with_confidence;
  const displayFields = [
    { key: 'product_name', label: 'Product' },
    { key: 'brand', label: 'Brand' },
    { key: 'price', label: 'Price' },
    { key: 'availability', label: 'Availability' },
    { key: 'description', label: 'Description' },
    { key: 'material', label: 'Material' },
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
        }}
      >
        Overall confidence: {(data.overall_confidence * 100).toFixed(0)}%
      </div>

      {displayFields.map(({ key, label }) => {
        const field = fields[key];
        if (!field || field.value === null || field.value === 'unknown')
          return null;

        const isLow = field.confidence < 0.85;
        let displayValue = String(field.value);
        if (key === 'price' && data.price) {
          displayValue = `${data.price.currency} ${data.price.amount.toFixed(2)}`;
        }
        if (Array.isArray(field.value)) {
          if (field.value.length === 0) return null;
          displayValue = field.value.join(', ');
        }

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
              <span
                style={{ fontSize: '0.75rem', color: '#9ca3af' }}
              >
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
                {displayValue}
              </div>
            </div>
            <ConfidenceBadge score={field.confidence} />
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
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
        ShopGraph Extraction
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
                  <div key={index} style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                    {part.text}
                  </div>
                );
              }
              if (isStaticToolUIPart(part)) {
                const result = part.result;
                if (isExtractionResult(result)) {
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
