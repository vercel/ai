'use client';

import { useState } from 'react';

export function Client({ action }) {
  const [log, setLog] = useState('');

  return (
    <div>
      <pre id="log" style={{ border: '1px solid #ccc', padding: 5 }}>
        {log}
      </pre>

      {/* Test suites */}
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5 }}>
        <button
          id="test-streamui-text"
          onClick={async () => {
            setLog(await action('text'));
          }}
        >
          Test streamUI() Text UI
        </button>
        <button
          id="test-streamui-wrapped-text"
          onClick={async () => {
            setLog(await action('wrapped-text'));
          }}
        >
          Test streamUI() Wrapped Text UI
        </button>
        <button
          id="test-streamui-tool"
          onClick={async () => {
            setLog(await action('tool'));
          }}
        >
          Test streamUI() Tool
        </button>
      </div>
    </div>
  );
}
