import { scaledown } from '@ai-sdk/scaledown';
import { experimental_extract } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_extract({
    model: scaledown.extractionModel('extract-1'),
    state: 'Invoice INV-2041 from Acme Corp. Contacts: Ana, Bo.',
    fields: {
      invoiceNumber: { type: 'text', instructions: 'The invoice number' },
      vendor: { type: 'text', instructions: 'Company that issued the invoice' },
      contacts: { type: 'list', items: 'text', instructions: 'Contact names' },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
});
