import express, { Request, Response } from 'express';

const app = express();

app.post('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

app.listen(8080, () => {
  console.log(`Example app listening on port ${8080}`);
});
