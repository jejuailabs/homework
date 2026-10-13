import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.QA_NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // jwks-rsa loads ESM-only jose from CommonJS. Bundle this chain so serverless
  // runtimes with require(ESM) disabled can load Firebase Auth without downgrades.
  transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(self), microphone=(self), geolocation=()'}
    ]}];
  }
};
export default config;
