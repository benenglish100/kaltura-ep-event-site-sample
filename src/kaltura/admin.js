// Shared admin-KS factory and API clients for server code and the CLI scripts.
import { generateKs, SessionType } from './ks.js';
import { createKalturaApi } from './api.js';
import { createEventsApi } from './events-api.js';

/** Returns a function producing short-lived admin KSs for the Event Platform team-member user. */
export function adminKsFactory({ partnerId, adminSecret, adminUserId }) {
  return () =>
    generateKs({
      partnerId,
      adminSecret,
      type: SessionType.ADMIN,
      userId: adminUserId,
      privileges: { disableentitlement: '' },
      expirySeconds: 300,
    });
}

/** Builds { getAdminKs, kalturaApi, eventsApi } from the `kaltura` section of the config. */
export function createKalturaClients(k) {
  const getAdminKs = adminKsFactory(k);
  return {
    getAdminKs,
    kalturaApi: createKalturaApi({ serviceUrl: k.serviceUrl, partnerId: k.partnerId }),
    eventsApi: createEventsApi({ eventsApiUrl: k.eventsApiUrl, getAdminKs }),
  };
}
