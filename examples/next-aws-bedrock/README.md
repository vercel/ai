# Vercel AI SDK, Next.js, and AWS Bedrock Example

This example shows how to use the [Vercel AI SDK](https://sdk.vercel.ai/docs) with [Next.js](https://nextjs.org/) and [Amazon Bedrock](https://aws.amazon.com/bedrock/) to create a ChatGPT-like AI-powered streaming chat bot.

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=ai-sdk-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fai%2Ftree%2Fmain%2Fexamples%2Fnext-aws-bedrock&env=AWS_REGION,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY&envDescription=AWS%20Access%20Information&project-name=vercel-ai-chat-aws-bedrock&repository-name=vercel-ai-chat-aws-bedrock)

## How to use

To run the example locally you need to:

1. Create an [AWS Account](https://portal.aws.amazon.com/billing/signup).
2. Setup Amazon Bedrock and apply for access to the models that you want to use.
3. Setup an access key under "Security Credentials".
4. Set the region of the models, your access key and your secret access key as shown in [the example env file](./.env.local.example) but in a new file called `.env.local`
5. `pnpm install` to install the required dependencies.
6. `pnpm dev` to launch the development server.
7. Go to the browser and try out a chatbot example for one of the following models:
   - [Anthropic Claude](http://localhost:3000/anthropic): `anthropic.claude-v2`
   - [Cohere](http://localhost:3000/cohere): `cohere.command-light-text-v14`
   - [Llama 2](http://localhost:3000/llama2): `meta.llama2-13b-chat-v1`

## Learn More

To learn more about AWS Bedrock, Next.js, and the Vercel AI SDK take a look at the following resources:

- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [Vercel AI Playground](https://play.vercel.ai)
- [AWS Bedrock](https://aws.amazon.com/bedrock/)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
