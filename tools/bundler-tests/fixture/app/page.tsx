'use client';

import { useState } from 'react';
import { checkSchemas } from '../lib/check-schemas';

export default function Page() {
  const [result, setResult] = useState('Not run');

  return (
    <main>
      <button
        type="button"
        onClick={async () => {
          try {
            setResult(JSON.stringify(await checkSchemas()));
          } catch (error) {
            setResult(String(error));
          }
        }}
      >
        Check schemas
      </button>
      <output>{result}</output>
    </main>
  );
}
