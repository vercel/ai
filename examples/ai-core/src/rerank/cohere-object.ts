import { cohere, CohereRerankingOptions } from '@ai-sdk/cohere';
import { rerank } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

const documents = [
  {
    from: 'Paul Doe <paul_fake_doe@oracle.com>',
    to: ['Steve <steve@me.com>', 'lisa@example.com'],
    date: '2024-03-27',
    subject: 'Follow-up',
    text: 'We are happy to give you the following pricing for your project.',
  },
  {
    from: 'John McGill <john_fake_mcgill@microsoft.com>',
    to: ['Steve <steve@me.com>'],
    date: '2024-03-28',
    subject: 'Missing Information',
    text: 'Sorry, but here is the pricing you asked for for the newest line of your models.',
  },
  {
    from: 'John McGill <john_fake_mcgill@microsoft.com>',
    to: ['Steve <steve@me.com>'],
    date: '2024-02-15',
    subject: 'Commited Pricing Strategy',
    text: 'I know we went back and forth on this during the call but the pricing for now should follow the agreement at hand.',
  },
  {
    from: 'Generic Airline Company<no_reply@generic_airline_email.com>',
    to: ['Steve <steve@me.com>'],
    date: '2023-07-25',
    subject: 'Your latest flight travel plans',
    text: 'Thank you for choose to fly Generic Airline Company. Your booking status is confirmed.',
  },
  {
    from: 'Generic SaaS Company<marketing@generic_saas_email.com>',
    to: ['Steve <steve@me.com>'],
    date: '2024-01-26',
    subject:
      'How to build generative AI applications using Generic Company Name',
    text: 'Hey Steve! Generative AI is growing so quickly and we know you want to build fast!',
  },
  {
    from: 'Paul Doe <paul_fake_doe@oracle.com>',
    to: ['Steve <steve@me.com>', 'lisa@example.com'],
    date: '2024-04-09',
    subject: 'Price Adjustment',
    text: "Re: our previous correspondence on 3/27 we'd like to make an amendment on our pricing proposal. We'll have to decrease the expected base price by 5%.",
  },
];

run(async () => {
  const result = await rerank({
    model: cohere.rerankingModel('rerank-v3.5'),
    documents,
    query: 'Which pricing did we get from Oracle?',
    topN: 2,
    providerOptions: {
      cohere: {
        priority: 1,
      } satisfies CohereRerankingOptions,
    },
  });

  print('Reranking:', result.ranking);
  print('Metadata:', result.providerMetadata);
});
