'use client';

import { useState } from 'react';

type ShippingRate = {
  carrierCode: string;
  shippingService: string;
  discountedPrice: string[];
};

type SavingsEntry = {
  dimension: 'length' | 'width' | 'height';
  reduction: number;
  service: string;
  savings: number;
  newCost: number;
};

type ShippingResponse = {
  originalRates: ShippingRate[];
  savings: SavingsEntry[];
  error?: string;
};

const defaultFormState = {
  sellerZip: '44026',
  buyerZip: '43231',
  weightLbs: 1,
  weightOz: 10,
  length: 10,
  width: 5,
  height: 5,
};

export default function ShippingEstimatorPage() {
  const [formState, setFormState] = useState(defaultFormState);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<ShippingResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    setFormState(prev => ({
      ...prev,
      [name]: name.includes('Zip') ? value : Number(value),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setResponse(null);

    try {
      const result = await fetch('/api/shipping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formState),
      });

      const data = (await result.json()) as ShippingResponse;

      if (!result.ok) {
        throw new Error(data.error ?? 'Unable to calculate shipping.');
      }

      setResponse(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          eBay Shipping Calculator
        </p>
        <h1 className="text-3xl font-semibold text-slate-900">
          Estimate rates and explore cost-saving box tweaks
        </h1>
        <p className="text-base text-slate-600">
          Enter package details and compare shipping options with potential
          savings by reducing box dimensions.
        </p>
      </header>

      <form
        className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Seller ZIP
            <input
              name="sellerZip"
              value={formState.sellerZip}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Buyer ZIP
            <input
              name="buyerZip"
              value={formState.buyerZip}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Weight (lbs)
            <input
              name="weightLbs"
              type="number"
              min="0"
              value={formState.weightLbs}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Weight (oz)
            <input
              name="weightOz"
              type="number"
              min="0"
              value={formState.weightOz}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Length (in)
            <input
              name="length"
              type="number"
              min="1"
              value={formState.length}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Width (in)
            <input
              name="width"
              type="number"
              min="1"
              value={formState.width}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Height (in)
            <input
              name="height"
              type="number"
              min="1"
              value={formState.height}
              onChange={handleChange}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          disabled={isLoading}
        >
          {isLoading ? 'Calculating...' : 'Get Shipping Rates'}
        </button>
      </form>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {response?.originalRates?.length ? (
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Original shipping options
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Rates are sorted from cheapest to most expensive.
            </p>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Carrier</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {response.originalRates.map(rate => (
                    <tr
                      key={`${rate.carrierCode}-${rate.shippingService}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {rate.carrierCode}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {rate.shippingService}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        ${Number(rate.discountedPrice[0]).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Recommended cost savings
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Suggestions only appear if the new cost beats the average of the
              five cheapest services.
            </p>
            {response.savings.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Dimension reduced</th>
                      <th className="px-4 py-3">Reduction</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3 text-right">Savings</th>
                      <th className="px-4 py-3 text-right">New cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.savings.map((entry, index) => (
                      <tr
                        key={`${entry.dimension}-${entry.reduction}-${entry.service}-${index}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {entry.dimension}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.reduction} in
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.service}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          ${entry.savings.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          ${entry.newCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No significant cost savings found by reducing package
                dimensions.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
