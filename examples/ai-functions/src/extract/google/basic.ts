import { google } from '@ai-sdk/google';
import { experimental_extract } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_extract({
    model: google.extractionModel('gemini-4-hydrogen'),
    referenceDate: '2026-11-11',
    state:
      'Invoice INV-2041 from Acme. Total due $1,250.00 by March 3 at 5:30 PM. Call Ana or Bo within 2 hours if anything is wrong.',
    fields: {
      invoiceNumber: { type: 'text', instructions: 'The invoice number' },
      total: { type: 'number', instructions: 'Total amount due', decimals: 2 },
      dueDate: { type: 'date', instructions: 'Payment due date' },
      dueTime: { type: 'time', instructions: 'Payment due time' },
      callWithin: {
        type: 'duration',
        instructions: 'How soon to call',
        unit: 'minutes',
      },
      contacts: { type: 'list', items: 'text', instructions: 'Contact names' },
      purchaseOrder: {
        type: 'text',
        instructions: 'The purchase order number',
      },
    },
  });

  console.log('Answers:', result.answers);
  console.log('Usage:', result.usage);
  console.log('Model:', result.response.modelId);
});
