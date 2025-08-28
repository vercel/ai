import { bedrock } from '@ai-sdk/amazon-bedrock';
import { experimental_rerank as rerank } from 'ai';
import 'dotenv/config';

async function main() {
  // Reranking with amazon model (text documents)
  const { rerankedDocuments: docs1 } = await rerank({
    model: bedrock.rerankingModel('amazon.rerank-v1:0'),
    values: [
      'Carson City is the capital city of the American state of Nevada. At the 2010 United States Census, Carson City had a population of 55,274.',
      'The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean that are a political division controlled by the United States. Its capital is Saipan.',
      'Charlotte Amalie is the capital and largest city of the United States Virgin Islands. It has about 20,000 people. The city is on the island of Saint Thomas.',
      'Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district. The President of the USA and many major national government offices are in the territory. This makes it the political center of the United States of America.',
      'Capital punishment has existed in the United States since before the United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states. The federal government (including the United States military) also uses capital punishment.',
    ],
    query: 'What is the capital of the United States?',
    topK: 2,
  });

  console.log('Reranked Documents:');
  for (const doc of docs1) {
    console.log(
      `- Index: ${doc.index}, Score: ${doc.relevanceScore.toFixed(4)}, Text: "${doc.document}"`,
    );
  }

  // Reranking with Cohere model (JSON documents)
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

  const { rerankedDocuments: docs3 } = await rerank({
    model: bedrock.rerankingModel('cohere.rerank-v3-5:0'),
    values: documents,
    query: 'Which pricing did we get from Oracle?',
    topK: 2,
  });

  console.log('Reranked Documents:');
  for (const doc of docs3) {
    console.log(
      `- Index: ${doc.index}, Score: ${doc.relevanceScore.toFixed(4)}`,
    );
    console.log(`  Document: ${JSON.stringify(doc.document)}`);
  }
}

main().catch(console.error);
