'use server';

import { experimental_streamObject } from 'ai';
import { openai } from 'ai/openai';
import { createAI, createStreamableUI } from 'ai/rsc';
import { itinerarySchema } from './itinerary';
import { ItineraryView } from './itinerary-view';

export async function submitItineraryRequest({
  destination,
  lengthOfStay,
}: {
  destination: string;
  lengthOfStay: string;
}) {
  'use server';

  const ui = createStreamableUI(<ItineraryView />);
  let isGenerating = true;

  experimental_streamObject({
    model: openai.chat('gpt-4-1106-preview'),
    maxRetries: 2500,
    schema: itinerarySchema,
    system:
      `You help planning travel itineraries. ` +
      `Respond to the users' request with a list ` +
      `of the best stops to make in their destination.`,
    prompt:
      `I am planning a trip to ${destination} for ${lengthOfStay} days. ` +
      `Please suggest the best tourist activities for me to do.`,
  })
    // non-blocking: the generateItinerary call returns immediately
    .then(async result => {
      try {
        for await (const partialItinerary of result.partialObjectStream) {
          ui.update(<ItineraryView itinerary={partialItinerary} />);
        }
      } finally {
        isGenerating = false;
        ui.done();
      }
    });

  return {
    isGenerating,
    itineraryComponent: ui.value,
  };
}

const initialAIState: {
  destination: string;
  lengthOfStay: string;
} = {
  destination: '',
  lengthOfStay: '',
};

const initialUIState: {
  isGenerating: boolean;
  itineraryComponent: React.ReactNode;
} = {
  isGenerating: false,
  itineraryComponent: null,
};

export const GenerateItineraryAI = createAI({
  actions: {
    submitItineraryRequest,
  },
  initialUIState,
  initialAIState,
});
