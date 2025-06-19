export const searchEmails = ({
  query,
  has_attachments,
}: {
  query: string;
  has_attachments: boolean;
}) => {
  return [
    {
      id: '1',
      subject: 'Q1 Investor Update',
      date: 'Apr 1, 2023',
    },
    {
      id: '2',
      subject: 'Q2 Investor Update',
      date: 'Jul 1, 2023',
    },
    {
      id: '3',
      subject: 'Q3 Investor Update',
      date: 'Oct 1, 2023',
    },
  ];
};

export const openEmail = ({ id }: { id: string }) => {
  return {
    body: `
  Subject: Investor Update

  Hi Team,

  Here is the investor update for Q${id} 2023.

  We have seen a ${
    id === '1' ? 23 : id === '2' ? 34 : 42
  }% increase in revenue compared to last quarter. This is due to the successful launch of our new product line. We are also expanding our team to keep up with the demand. 

  Best,
  CEO
  
  `,
  };
};
