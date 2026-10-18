import type { NextConfig } from 'next';

const config: NextConfig = {
  distDir: process.env.QA_NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  outputFileTracingIncludes: {'/api/artbooks/**/*': ['./src/modules/digital-artbook/assets/*.ttf']},
  // jwks-rsa loads ESM-only jose from CommonJS. Bundle this chain so serverless
  // runtimes with require(ESM) disabled can load Firebase Auth without downgrades.
  transpilePackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  async headers() {
    return [{source:'/:path*',headers:[
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(self), microphone=(self), geolocation=()'}
    ]}, ...['/my-space/v1/:path*', '/my-space/v2/:path*'].map(source => ({source, headers:[{key:'Cache-Control',value:'public,max-age=31536000,immutable'}]})), ...['/gallery/moa-art-screen-v1.png', '/gallery/oak-art-frame-v1.png'].map(source => ({source, headers: [{key: 'Cache-Control', value: 'public,max-age=31536000,immutable'}]}))];
  }
};
export default config;
