'use server';

import { experimental_streamObject } from 'ai';
import { openai } from 'ai/openai';
import {
  StreamableValue,
  createAI,
  createStreamableUI,
  createStreamableValue,
} from 'ai/rsc';
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

  const itineraryCompoent = createStreamableUI(<ItineraryView />);
  const isGenerating = createStreamableValue(true);

  experimental_streamObject({
    model: openai.chat('gpt-4-1106-preview'),
    maxTokens: 2500,
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
          itineraryCompoent.update(
            <ItineraryView itinerary={partialItinerary} />,
          );
        }
      } finally {
        isGenerating.done(false);
        itineraryCompoent.done();
      }
    });

  return {
    isGenerating: isGenerating.value,
    itineraryComponent: itineraryCompoent.value,
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
  isGenerating: StreamableValue<boolean>;
  itineraryComponent: React.ReactNode;
} = {
  isGenerating: createStreamableValue(false).value,
  itineraryComponent: null,
};

export const GenerateItineraryAI = createAI({
  actions: {
    submitItineraryRequest,
  },
  initialUIState,
  initialAIState,
});
