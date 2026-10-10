// Client for the Kaltura Events Platform public API.
// Spec: https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml
// Auth: admin KS (with a userId that is an Event Platform team member) as a Bearer token.

export class EventsApiError extends Error {
  constructor(message, status, apiStatus) {
    super(message);
    this.name = 'EventsApiError';
    this.status = status;
    this.apiStatus = apiStatus;
  }
}

const TIMEOUT_MS = 15000;

export function createEventsApi({ eventsApiUrl, getAdminKs }) {
  async function post(path, body) {
    const res = await fetch(`${eventsApiUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${getAdminKs()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok || (json && json.status && json.status !== 'ok')) {
      const apiStatus = json?.status;
      throw new EventsApiError(
        `Events API ${path} failed: HTTP ${res.status}${apiStatus ? ` (${apiStatus})` : ''}${json?.message ? ` ${json.message}` : ''}`,
        res.status,
        apiStatus,
      );
    }
    return json;
  }

  return {
    // events/list allows at most 15 per page; its pager.offset is a page index.
    async listEvents({ max = 45 } = {}) {
      const events = [];
      for (let page = 0; events.length < max; page++) {
        const json = await post('events/list', { pager: { offset: page, limit: 15 }, orderBy: '-startDate' });
        const batch = json.events || [];
        events.push(...batch);
        if (batch.length < 15 || events.length >= (json.totalCount ?? 0)) break;
      }
      return events.slice(0, max);
    },

    async getEvent(eventId) {
      const json = await post('events/list', { filter: { idIn: [Number(eventId)] }, pager: { offset: 0, limit: 1 } });
      return json.events?.[0] || null;
    },

    async listSessions(eventId) {
      const json = await post('sessions/list', { eventId: Number(eventId) });
      return json.sessions || [];
    },

    /** Finds an event user by exact (case-insensitive) email match. */
    async findEventUserByEmail(eventId, email) {
      const target = email.trim().toLowerCase();
      const pageSize = 50;
      for (let offset = 0; offset < 1000; offset += pageSize) {
        const json = await post('event-users/list', {
          eventId: Number(eventId),
          filter: { searchTerm: target },
          pager: { offset, limit: pageSize },
        });
        const users = json.users || [];
        const match = users.find((u) => (u.email || '').toLowerCase() === target);
        if (match) return match;
        if (users.length < pageSize) return null;
      }
      return null;
    },
  };
}
