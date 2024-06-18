'use client';

import React, { useState } from 'react';
import { readStreamableValue } from 'ai/rsc';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div>Caught by Error Boundary: {this.state.error}</div>;
    }
    return this.props.children;
  }
}

export function Client({ actions }) {
  const [log, setLog] = useState('');

  // Test `createStreamableValue` and `readStreamableValue` APIs
  async function testStreamableValue() {
    const value = await actions.streamableValue();

    const values = [];
    for await (const val of readStreamableValue(value)) {
      values.push(val);
      setLog(JSON.stringify(values));
    }
  }

  // Test `createStreamableUI` API
  async function testStreamableUI() {
    setLog(null);
    const value = await actions.streamableUI();
    setLog(value);
  }
  async function testStreamableUIAppend() {
    setLog(null);
    const value = await actions.streamableUIAppend();
    setLog(value);
  }
  async function testStreamableUIError() {
    setLog(null);
    const value = await actions.streamableUIError();
    setLog(<ErrorBoundary>{value}</ErrorBoundary>);
  }

  return (
    <div>
      <pre id="log" style={{ border: '1px solid #ccc', padding: 5 }}>
        {log}
      </pre>

      {/* Test suites */}
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5 }}>
        <button id="test-streamable-value" onClick={testStreamableValue}>
          Test Streamable Value
        </button>
        <button id="test-streamable-ui" onClick={testStreamableUI}>
          Test Streamable UI
        </button>
        <button id="test-streamable-ui-append" onClick={testStreamableUIAppend}>
          Test Streamable UI (Append)
        </button>
        <button id="test-streamable-ui-error" onClick={testStreamableUIError}>
          Test Streamable UI (Error)
        </button>
      </div>
    </div>
  );
}
