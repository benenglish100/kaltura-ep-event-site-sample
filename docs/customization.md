# Customization

- [Plug in your own sign-in](#plug-in-your-own-sign-in)
- [Branding](#branding)
- [Layout](#layout)
- [Chat & Collaboration options](#chat--collaboration-options)
- [Consent text](#consent-text)
- [Sessions and more pages](#sessions-and-more-pages)
- [Player options](#player-options)

---

## Plug in your own sign-in

Everything after sign-in depends on one object stored in the session cookie:

```js
{ id, email, firstName, lastName, roles }   // id = Event Platform user ID
```

[src/auth/authenticate.js](../src/auth/authenticate.js) builds it in two steps:

1. `checkCredentials(username, password)` → `{ email, … }`: **replace this** with your identity check.
2. `eventsApi.findEventUserByEmail(eventId, email)` → the EP user (id, roles, status): **keep this**.

### Example: SSO (OIDC/SAML)

Replace the password form with your IdP redirect, and in your callback route:

```js
// after your IdP has verified the user and given you their email:
const eventUser = await eventsApi.findEventUserByEmail(config.kaltura.eventId, email);
if (!eventUser || /block|declin|cancel|remov|reject|denied/i.test(eventUser.status || '')) {
  return res.redirect('/not-registered');
}
req.session = {
  user: { id: eventUser.id, email, firstName: eventUser.firstName, lastName: eventUser.lastName, roles: eventUser.roles },
  createdAt: Date.now(),
};
res.redirect('/session');
```

Libraries such as `openid-client` (OIDC) or `@node-saml/passport-saml` (SAML) fit here. Nothing else
in the app needs to change.

### Example: your registration system

If attendees register on your own site, call the Events API's `event-users/invite` (with `skipEmail: true`
if you send your own emails) when they register, so they exist in Event Platform. See the
[OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml).

---

## Branding

| What | Where |
|---|---|
| Site title, brand color, CnC light/dark | `SITE_TITLE`, `BRAND_COLOR`, `CNC_THEME_MODE` ([configuration.md](configuration.md#look--feel)) |
| Colors, fonts, spacing | CSS variables at the top of [public/styles.css](../public/styles.css) |
| Page markup (logo, header, footer) | [views/login.html](../views/login.html), [views/session.html](../views/session.html) |
| Player look | Edit the player uiconf in KMC → Studio, or use your own Player v7 |

`BRAND_COLOR` sets the CSS variable `--brand` at runtime and is passed to CnC as `ui.theme.brandColor`.

---

## Layout

The components render into elements you place:

| Element | Contents |
|---|---|
| `#player` | Kaltura Player (fills its parent; the parent sets the 16:9 box) |
| `#live-reactions` | Floating emoji reactions, positioned over the player |
| `#cnc-container` | CnC root (keep it in the DOM; it has no visible size of its own) |
| `#cnc-chat` | Chat / Q&A / Updates panel |
| `#cnc-sidebar-buttons` | Module buttons (Updates, Live stage, Private chat, …) |
| `#cnc-reactions` | Emoji picker |
| `#cnc-sidebar-settings` | Settings ("…") menu |

Move them anywhere in [views/session.html](../views/session.html), e.g. chat below the player, sidebar
on the left, or the chat in a drawer. The responsive rules (`@media (max-width: 960px)`) in
`styles.css` stack the chat under the player and turn the sidebar into a top bar on phones.

When the user collapses the panel, CnC calls `addOnClose`; the app adds `.collapsed` to `#chat-panel`.
Style that class to suit your layout.

---

## Chat & Collaboration options

The widget configuration object is `cncConfig` in [public/session.js](../public/session.js):

| Option | Effect |
|---|---|
| `ui.theme.brandColor` / `ui.theme.mode` | Accent color; `light` / `dark` |
| `ui.locale` | UI language (e.g. `en`) |
| `ui.groupChat` | Enable group chat, message reactions, replies |
| `ui.instanceOptions` | `enableChat`, `enableSearch`, `enableAssistant` |
| `ui.zIndex` | Stacking order of CnC overlays |
| `consent.*` | Consent dialog text URL(s), default user preferences, cookie consent |
| `reactions` | `mode: 'on'/'off'`, `sourceUrl` (reactions bundle), analytics `endpointUrl`, `ks` |
| `moderation.moderatorUrl` | Moderator app used for moderator features |

Which modules appear (Q&A, polls, announcements, …) is configured per session in **Event Platform**.

---

## Consent text

The first time a user opens CnC they see a consent dialog with the text from
[public/legal.txt](../public/legal.txt). Replace it with your organization's wording. For several
languages, add more keys to `consent.legalTextUrls` (e.g. `{ en: '…/legal.txt', fr: '…/legal.fr.txt' }`).

---

## Sessions and more pages

* The session switcher appears when an event has more than one selectable webcast session.
* `/session?id=<entryId>` deep-links to a session.
* For an agenda page, use `eventsApi.listSessions(eventId)` (name, description, start/end, type,
  thumbnail URL) and link each item to `/session?id=…`.
* Speakers: Events API `sessions/speakerList` / `session-participants/list`.

---

## Player options

`setupPlayer()` in [public/session.js](../public/session.js) passes the minimum: target, partner,
uiconf, KS. You can add any [Kaltura Player options](https://github.com/kaltura/kaltura-player-js/blob/master/docs/configuration.md),
for example:

```js
KalturaPlayer.setup({
  targetId: 'player',
  provider: { partnerId, uiConfId, ks },
  playback: { autoplay: true, muted: true },   // muted autoplay for live
});
```

`window.__epPoc.player` holds the player instance for debugging.
