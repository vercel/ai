import { togetherai } from '@ai-sdk/togetherai';
import { experimental_rerank as rerank } from 'ai';
import 'dotenv/config';

const query = 'Which pricing did we get from Oracle?';

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

async function main() {
  const { usage, rerankedDocuments } = await rerank({
    model: togetherai.rerankingModel('Salesforce/Llama-Rank-v1'),
    values: documents,
    query,
    topK: 2,
    providerOptions: {
      togetherai: {
        rankFields: ['from', 'to', 'date', 'subject', 'text'],
      },
    },
  });

  console.log('Reranked Documents:');
  for (const document of rerankedDocuments) {
    console.log(`Document Index: ${document.index}`);
    console.log(`Document: ${JSON.stringify(document.document)}`);
    console.log(`Relevance Score: ${document.relevanceScore}`);
  }

  // Document Index: 0
  // Document: {"from":"Paul Doe <paul_fake_doe@oracle.com>","to":["Steve <steve@me.com>","lisa@example.com"],"date":"2024-03-27","subject":"Follow-up","text":"We are happy to give you the following pricing for your project."}
  // Relevance Score: 0.6475887154399037
  // Document Index: 5
  // Document: {"from":"Paul Doe <paul_fake_doe@oracle.com>","to":["Steve <steve@me.com>","lisa@example.com"],"date":"2024-04-09","subject":"Price Adjustment","text":"Re: our previous correspondence on 3/27 we'd like to make an amendment on our pricing proposal. We'll have to decrease the expected base price by 5%."}
  // Relevance Score: 0.6323295373206566

  console.log('Usage:');
  console.log(usage);

  //   Usage:
  //   {
  //     tokens: 2966,
  //   }
}

main().catch(console.error);
