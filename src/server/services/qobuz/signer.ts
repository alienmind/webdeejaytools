import crypto from 'crypto';

/**
 * Generates a request signature for Qobuz API v0.2.
 * 
 * Signature formula:
 * 1. Normalize endpoint by removing slashes (e.g. 'track/getFileUrl' -> 'trackgetFileUrl').
 * 2. Collect all parameters (excluding 'request_sig', 'request_ts', 'app_id').
 * 3. Sort parameter keys alphabetically.
 * 4. Concatenate: endpoint + key1 + val1 + key2 + val2 + ... + request_ts + secret.
 * 5. Compute MD5 hex hash of the resulting UTF-8 string.
 */
export function generateRequestSignature(
  endpoint: string,
  params: Record<string, string | number | boolean | undefined | null>,
  requestTs: string | number,
  secret: string
): string {
  const cleanEndpoint = endpoint.replace(/^\/+|\/+$/g, '').replace(/\//g, '');

  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'request_sig' && k !== 'request_ts' && k !== 'app_id' && params[k] !== undefined && params[k] !== null)
    .sort();

  let queryStr = '';
  for (const key of sortedKeys) {
    queryStr += `${key}${params[key]}`;
  }

  const signString = `${cleanEndpoint}${queryStr}${requestTs}${secret}`;
  return crypto.createHash('md5').update(signString, 'utf-8').digest('hex');
}
