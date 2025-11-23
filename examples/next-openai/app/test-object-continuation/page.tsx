'use client';

import { useState } from 'react';

type Step = {
  attempt: number;
  text: string;
  validationStatus: 'pending' | 'passed' | 'failed' | 'skipped';
  validationError?: string;
  rawValidationError?: string;
  feedbackMessage?: string;
  object?: unknown;
};

export default function TestObjectContinuation() {
  const [validationEnabled, setValidationEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    object: unknown;
    finishReason: string;
    usage: { totalTokens?: number };
    steps: Step[];
    attemptCount: number;
    validationEnabled: boolean;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/object-continuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'Generate a user object',
          validationEnabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate object');
      }

      const data = await response.json();

      if (!response.ok || data.error) {
        // Handle validation errors when validation is disabled
        if (data.validationFailed) {
          setResult({
            object: null,
            finishReason: 'error',
            usage: {},
            steps: data.steps || [],
            attemptCount: data.attemptCount || 0,
            validationEnabled: data.validationEnabled,
            error: data.error,
          });
        } else {
          throw new Error(data.error || 'Failed to generate object');
        }
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      <h1 className="mb-4 text-xl font-bold">
        Object Generation Continuation Test
      </h1>
      <p className="mb-4 text-sm text-gray-600">
        This example demonstrates how to use generateObject with onStepFinish to
        validate outputs and continue the loop with feedback when validation
        fails.
      </p>

      <div className="mb-6 p-4 border rounded-lg bg-gray-50 space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Enable Validation
          </label>
          <button
            onClick={() => setValidationEnabled(!validationEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              validationEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                validationEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-gray-500">
          When enabled: Validates user object schema (name 3-50 chars, valid
          email, age 18-120, bio at least 100 chars). Automatically retries on
          failure.
          <br />
          When disabled: Still validates but does not retry - returns first
          result even if invalid.
          <br />
          <strong>Note:</strong> The default prompt intentionally asks for
          invalid values (short name "Jo", young age, short bio) to demonstrate
          the retry mechanism.
        </p>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : 'Generate User Object'}
      </button>

      {loading && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-blue-800 font-semibold mb-2">Generating...</div>
          <div className="text-blue-600 text-sm">
            {validationEnabled
              ? 'Validating object against schema...'
              : 'Generating object (validation disabled)...'}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="text-red-800 font-semibold">Error:</div>
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          {/* Steps/Attempts History */}
          {result.steps && result.steps.length > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
              <div className="text-gray-800 font-semibold mb-3">
                Generation Steps ({result.attemptCount} attempt
                {result.attemptCount !== 1 ? 's' : ''})
              </div>
              <div className="space-y-2">
                {result.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border ${
                      step.validationStatus === 'passed'
                        ? 'bg-green-50 border-green-200'
                        : step.validationStatus === 'failed'
                          ? 'bg-red-50 border-red-200'
                          : step.validationStatus === 'skipped'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        Attempt {step.attempt}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          step.validationStatus === 'passed'
                            ? 'bg-green-200 text-green-800'
                            : step.validationStatus === 'failed'
                              ? 'bg-red-200 text-red-800'
                              : step.validationStatus === 'skipped'
                                ? 'bg-yellow-200 text-yellow-800'
                                : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {step.validationStatus === 'passed'
                          ? '✓ Valid'
                          : step.validationStatus === 'failed'
                            ? '✗ Invalid'
                            : step.validationStatus === 'skipped'
                              ? '⊘ Skipped'
                              : '⏳ Pending'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      <div className="font-medium mb-1">Generated JSON:</div>
                      <pre className="whitespace-pre-wrap break-words bg-white p-2 rounded border text-xs">
                        {step.text.substring(0, 150)}
                        {step.text.length > 150 ? '...' : ''}
                      </pre>
                    </div>
                    {step.validationError && (
                      <div className="text-xs mt-2 space-y-1">
                        <div className="text-red-700 font-semibold mb-1">
                          Validation Errors:
                        </div>
                        <div className="text-red-600 bg-red-50 p-2 rounded border border-red-200">
                          {step.validationError}
                        </div>
                        {step.rawValidationError &&
                          step.rawValidationError !== step.validationError && (
                            <div className="text-red-500 text-xs mt-1 italic">
                              Raw error: {step.rawValidationError}
                            </div>
                          )}
                      </div>
                    )}
                    {step.feedbackMessage && (
                      <div className="text-xs mt-2 space-y-1">
                        <div className="text-blue-700 font-semibold mb-1">
                          Feedback Sent to Model:
                        </div>
                        <div className="text-blue-600 bg-blue-50 p-2 rounded border border-blue-200 italic">
                          "{step.feedbackMessage}"
                        </div>
                      </div>
                    )}
                    {step.validationStatus === 'skipped' && (
                      <div className="text-xs text-yellow-600 mt-1">
                        Validation was disabled for this attempt
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final Result */}
          {result.error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="text-red-800 font-semibold mb-2">
                Generation Failed
              </div>
              <div className="text-red-600 text-sm mb-2">{result.error}</div>
              {!result.validationEnabled && (
                <div className="text-xs text-red-600 mt-2">
                  Validation was disabled, so the invalid object was not
                  retried. Enable validation to automatically retry with
                  feedback.
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="text-green-800 font-semibold mb-2">
                Final Generated Object:
              </div>
              <pre className="text-sm bg-white p-2 rounded border overflow-auto">
                {JSON.stringify(result.object, null, 2)}
              </pre>
              <div className="mt-2 text-xs text-gray-600">
                Finish Reason: {result.finishReason}
                <br />
                Usage: {result.usage?.totalTokens} tokens
                {result.validationEnabled && (
                  <>
                    <br />
                    Validation: Enabled ({result.attemptCount} attempt
                    {result.attemptCount !== 1 ? 's' : ''})
                  </>
                )}
                {!result.validationEnabled && (
                  <>
                    <br />
                    Validation: Disabled (object generated without retry on
                    validation failure)
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
