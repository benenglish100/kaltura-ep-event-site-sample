// Username/password authentication for attendees, then an Event Platform registration check.
import { KalturaApiError } from '../kaltura/api.js';
import { verifyLocalUser } from './local-users.js';

export class AuthError extends Error {
  constructor(reason, message, detail = reason) {
    super(message);
    this.name = 'AuthError';
    this.reason = reason; // 'invalid_credentials' | 'not_registered' (sent to the browser)
    this.detail = detail; // finer-grained cause, for server logs only
  }
}

// Event user statuses that must not get in (the API documents "Invited, Registered, Confirmed, etc.").
const BLOCKED_STATUS = /block|declin|cancel|remov|reject|denied/i;

export function createAuthenticator({ config, kalturaApi, eventsApi }) {
  async function checkCredentials(username, password) {
    if (config.auth.mode === 'local') {
      const { user, reason } = await verifyLocalUser(config.auth.usersFile, username, password);
      if (!user) throw new AuthError('invalid_credentials', 'Invalid username or password', `local:${reason}`);
      return { email: user.email || user.username, firstName: user.firstName, lastName: user.lastName };
    }

    try {
      await kalturaApi.loginByLoginId(username, password);
    } catch (e) {
      // Any Kaltura API exception here (wrong password, unknown login, disabled login...) is a failed login.
      if (e instanceof KalturaApiError && e.code !== 'HTTP_ERROR') {
        throw new AuthError('invalid_credentials', 'Invalid username or password', `kaltura:${e.code}`);
      }
      throw e;
    }
    return { email: username };
  }

  return async function authenticate(username, password) {
    const identity = await checkCredentials(username, password);
    const eventId = config.kaltura.eventId;

    let eventUser = null;
    if (config.auth.requireEventRegistration) {
      eventUser = await eventsApi.findEventUserByEmail(eventId, identity.email);
      if (!eventUser || BLOCKED_STATUS.test(eventUser.status || '')) {
        throw new AuthError('not_registered', 'You are not registered for this event', eventUser ? `status:${eventUser.status}` : 'not_in_event');
      }
    }

    return {
      // The Event Platform user ID is the Kaltura user ID used by the player and CnC.
      id: eventUser?.id || identity.email,
      email: identity.email,
      firstName: eventUser?.firstName || identity.firstName || '',
      lastName: eventUser?.lastName || identity.lastName || '',
      roles: eventUser?.roles || ['Attendees'],
    };
  };
}
