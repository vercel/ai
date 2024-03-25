'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUIState } from 'ai/rsc';
import { useState } from 'react';
import {
  GenerateItineraryAI,
  submitItineraryRequest,
} from './generate-itinerary';

export default function ItineraryPage() {
  const [destination, setDestination] = useState('');
  const [lengthOfStay, setLengthOfStay] = useState('');
  const [result, setResult] = useUIState<typeof GenerateItineraryAI>();

  return (
    <div className="w-full max-w-2xl p-4 mx-auto md:p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold text-center">
        City Travel Itinerary Planner
      </h1>

      <form
        className="space-y-4"
        onSubmit={async e => {
          e.preventDefault();

          const result = await submitItineraryRequest({
            destination,
            lengthOfStay,
          });

          setResult(result);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="destination">Destination</Label>
          <Input
            id="destination"
            placeholder="Enter your destination"
            required
            value={destination}
            disabled={result.isGenerating}
            onChange={e => setDestination(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="length-of-stay">Length of Stay (Days)</Label>
          <Input
            id="length-of-stay"
            placeholder="Enter the length of your stay (up to 7 days)"
            required
            type="number"
            min="1" // Minimum length of stay
            max="7" // Maximum length of stay
            value={lengthOfStay}
            disabled={result.isGenerating}
            onChange={e => setLengthOfStay(e.target.value)}
          />
        </div>
        <Button className="w-full" type="submit" disabled={result.isGenerating}>
          Generate Itinerary
        </Button>
      </form>

      {result.itineraryComponent}
    </div>
  );
}
