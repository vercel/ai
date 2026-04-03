const { withWorkflow } = require('workflow/next');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ajv'],
};

module.exports = withWorkflow(nextConfig);
