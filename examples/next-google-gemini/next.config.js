/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',

  webpack: config => {
    config.resolve.alias.child_process = false;
    config.resolve.alias.crypto = false;
    config.resolve.alias.fs = false;
    config.resolve.alias.https = false;
    config.resolve.alias.os = false;
    config.resolve.alias.path = false;
    config.resolve.alias.querystring = false;
    config.resolve.alias.stream = false;

    config.resolve.alias['https-proxy-agent'] = false;

    return config;
  },
};

module.exports = nextConfig;
