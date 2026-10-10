// Minimal client for the Kaltura API v3 (https://developer.kaltura.com/api-docs/).
// Only the handful of calls this site needs; JSON in, JSON out.

export class KalturaApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'KalturaApiError';
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 15000;

export function createKalturaApi({ serviceUrl, partnerId, clientTag = 'event-site-example' }) {
  async function call(service, action, params = {}, ks) {
    const url = `${serviceUrl}/api_v3/service/${service}/action/${action}`;
    const body = { ...params, format: 1, clientTag, ...(ks ? { ks } : {}) };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new KalturaApiError(`${service}.${action} HTTP ${res.status}`, 'HTTP_ERROR', res.status);
    const json = await res.json();
    if (json && json.objectType === 'KalturaAPIException') {
      throw new KalturaApiError(`${service}.${action}: ${json.message}`, json.code, res.status);
    }
    return json;
  }

  return {
    call,

    /** Verifies a Kaltura login ID + password. Resolves to a KS, rejects with KalturaApiError on bad credentials. */
    loginByLoginId(loginId, password) {
      return call('user', 'loginByLoginId', { loginId, password, partnerId: Number(partnerId) });
    },

    /** Lists active app tokens (requires an admin KS). */
    async listActiveAppTokens(adminKs) {
      const result = await call(
        'appToken',
        'list',
        {
          filter: { objectType: 'KalturaAppTokenFilter', statusEqual: 2 },
          pager: { objectType: 'KalturaFilterPager', pageSize: 500 },
        },
        adminKs,
      );
      return result.objects || [];
    },
  };
}
