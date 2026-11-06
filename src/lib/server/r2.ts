import 'server-only';
import {AwsClient} from 'aws4fetch';

function connection() {
  const {R2_ACCOUNT_ID: account, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey} = process.env;
  if (!account || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {client: new AwsClient({accessKeyId, secretAccessKey, service: 's3', region: 'auto'}), base: `https://${account}.r2.cloudflarestorage.com/${bucket}/`};
}
export const r2Configured = () => !!connection();

function required() {
  const value = connection();
  if (!value) throw new Error('R2_NOT_CONFIGURED');
  return value;
}
const objectUrl = (base: string, path: string) => new URL(base + path.split('/').map(encodeURIComponent).join('/'));

/** Signs from the start of the window so a repeat view gets the same URL and the browser cache still works. */
export async function r2ReadUrl(path: string, {accessibleAt, expires, responseDisposition}: {accessibleAt: Date; expires: Date; responseDisposition?: string}) {
  const {client, base} = required(), url = objectUrl(base, path);
  url.searchParams.set('X-Amz-Expires', String(Math.floor((expires.getTime() - accessibleAt.getTime()) / 1000)));
  if (responseDisposition) url.searchParams.set('response-content-disposition', responseDisposition);
  const signed = await client.sign(url.toString(), {aws: {signQuery: true, datetime: accessibleAt.toISOString().replace(/[:-]|\.\d{3}/g, '')}});
  return signed.url;
}

export async function r2Delete(path: string) {
  const {client, base} = required(), response = await client.fetch(objectUrl(base, path).toString(), {method: 'DELETE'});
  if (!response.ok && response.status !== 404) throw new Error(`R2_DELETE_${response.status}`);
}
