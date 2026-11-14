import { experimental_extract } from 'ai';
import { Experimental_ExtractionMockModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const state =
    'Invoice INV-2041, total due $1,250.00 by March 3. Contacts: Ana, Bo.';

  const result = await experimental_extract({
    model: new Experimental_ExtractionMockModelV4({
      doExtract: async () => ({
        answers: {
          invoiceNumber: {
            type: 'text',
            value: 'INV-2041',
            source: { type: 'text', part: 0, start: 8, end: 16 },
          },
          total: { type: 'number', value: 1250 },
          dueDate: { type: 'date', value: '2027-03-03' },
          contacts: { type: 'list', value: ['Ana', 'Bo'] },
        },
        warnings: [],
      }),
    }),
    state,
    referenceDate: '2026-11-11',
    fields: {
      invoiceNumber: { type: 'text', instructions: 'The invoice number' },
      total: { type: 'number', instructions: 'Total due', decimals: 2 },
      dueDate: { type: 'date', instructions: 'Payment due date' },
      contacts: { type: 'list', items: 'text', instructions: 'Contact names' },
    },
  });

  console.log(result.answers);
});
