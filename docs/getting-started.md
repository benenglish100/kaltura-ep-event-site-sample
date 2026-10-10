# Getting started

This guide takes you from an empty Event Platform event to attendees watching and chatting on your
own site. It takes about 15 minutes if your Kaltura account already has Event Platform.

- [1. Prerequisites](#1-prerequisites)
- [2. Prepare the event in Event Platform](#2-prepare-the-event-in-event-platform)
- [3. Install the site](#3-install-the-site)
- [4. Configure it with the setup wizard](#4-configure-it-with-the-setup-wizard)
- [5. Give attendees access](#5-give-attendees-access)
- [6. Verify and start](#6-verify-and-start)
- [7. Run a test event](#7-run-a-test-event)
- [Using the app day to day](#using-the-app-day-to-day)

---

## 1. Prerequisites

**On your machine**

* **Node.js 22.9 or newer** (`node -v`).
* **Git**
* A modern browser (Chrome, Edge, Firefox, Safari)

**In Kaltura**

* A Kaltura account (partner) with **Event Platform** and **Chat & Collaboration** enabled
* Access to **KMC** (to read the partner ID and admin secret)
* An **Event Platform team member** account (Admin or Organizer)

See [kaltura-setup.md](kaltura-setup.md) for details on each item.

---

## 2. Prepare the event in Event Platform

1. **Create an event** in Event Platform. Any template works. The site only needs the event to exist.
2. **Add a session** of type **Live Webcast** (or **Simulive**). This is what the player shows.
   Interactive rooms (meeting/KME sessions) are not handled by this example.
3. **Invite attendees** (Event Platform → your event → Users), at least one test attendee.
   Use real mailboxes you control, e.g. `you+attendee@yourcompany.com`.
4. Optionally give a second user the **Moderator** role, to test moderation.
5. Make sure the Kaltura user you will configure as the *admin user* is listed under
   **Event Platform → Team** as **Admin** or **Organizer**.

---

## 3. Install the site

```bash
git clone <this-repo-url> event-site
cd event-site
npm install
```

> **Windows PowerShell:** if you see *"running scripts is disabled on this system"*, either use
> `npm.cmd` instead of `npm` in every command below, or run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

---

## 4. Configure it with the setup wizard

```bash
npm run setup
```

The wizard asks for three things and discovers the rest:

| Prompt | Where to find it |
|---|---|
| **Region** | `NVP` for most accounts. `EU` or `DE` if your account is hosted in Europe. |
| **Partner ID** | KMC → Settings → Integration Settings |
| **Admin secret** | Same page ("Administrator Secret"). Typing is hidden. |
| **Admin user ID** | The Kaltura user ID (usually an email) of an Event Platform **team member** |

It then:

1. **Verifies the credentials** against the Kaltura API.
2. **Lists your events** (most recent first). Pick one by number.
3. **Lists the event's sessions.** If there's more than one webcast you can pin one; otherwise the site
   picks the live-now or next session automatically.
4. **Finds the uiconfs** (component configurations) that Event Platform provisions on your account and
   pre-selects the right ones:
   * player: **"EP All Plugins (Do Not Delete)"**
   * Chat & Collaboration: **"KEP widgets - default UIconf for EP - latest"**
   * reactions: **"KEP reactions widgets latest"**
5. **Finds the CnC signing token** (an app token with `cncAuth:true`). If the account has none, it
   offers to create one. This is a one-time account setting.
6. Asks how attendees **sign in** (see step 5), a **site title** and a **brand color**.
7. Writes everything to **`.env`**, backing up any previous version to `.env.bak`.

Run it again at any time to change values; your current settings are offered as defaults.
To configure by hand instead, copy [.env.example](../.env.example) to `.env` and see
[configuration.md](configuration.md).

> `.env` contains your admin secret. It is git-ignored. Never commit it or share it.

---

## 5. Give attendees access

The site admits only people who are **registered for the event in Event Platform**. How they prove who
they are depends on `AUTH_MODE`:

### `AUTH_MODE=local` (default)

Event Platform invitations don't give attendees a password, so the site keeps its own.
For each attendee, using the **same email** they were invited with:

```bash
npm run add-user -- attendee@example.com
```

You're asked for the password twice (hidden). Passwords are stored as scrypt hashes in `users.json`,
which is git-ignored. Run the command again to reset a password.

### `AUTH_MODE=kaltura`

The site verifies the password against the user's **Kaltura login** (`user.loginByLoginId`). Use this only
if your attendees already have Kaltura logins with passwords.

### Your own sign-in (production)

For a real deployment you'll typically replace both with your identity provider (SSO, your CMS, a
registration system). There is one function to change; see [customization.md](customization.md#plug-in-your-own-sign-in).

---

## 6. Verify and start

```bash
npm run check
```

This checks your configuration against your real Kaltura account:

```
1. Admin secret (Kaltura API session.get)          ✔ Admin KS accepted
2. Events Platform API access + event              ✔ Event "Investor Day"
3. Event sessions                                   ✔ Default session: 1_abcd1234 "Keynote"
4. CnC app token (cncAuth:true)                     ✔ CnC signing token available
5. Player bundle (KALTURA_PLAYER_UICONF_ID)         ✔
6. CnC bundle (KALTURA_CNC_UICONF_ID)               ✔
7. Reactions bundle (CNC_REACTIONS_SOURCE_URL)      ✔
All checks passed.
```

If a uiconf is wrong, the check lists the right candidates on your account. To also confirm that a
particular attendee will be let in:

```bash
npm run check -- --user attendee@example.com
```

Then start the site:

```bash
npm start          # or: npm run dev   (restarts on code changes)
```

Open **http://localhost:3000**.

---

## 7. Run a test event

1. Start broadcasting to the webcast session (Kaltura Webcasting app, your encoder, or a Simulive session).
2. Sign in as your test attendee. You should see:
   * the **player** (an offline slate until the broadcast starts, then the live stream)
   * the **Chat & Collaboration** panel. The first time, a consent dialog appears (text from
     [public/legal.txt](../public/legal.txt)); after accepting: Updates, Live stage (chat and Q&A), Private chat
     and emoji reactions.
3. In a private window, sign in as a **Moderator**. Moderators get moderation abilities in CnC.
4. Post a chat message and a question as the attendee; check they appear for the moderator and in
   Event Platform's moderation tools.
5. Open the browser console (F12). With `CSP_ENFORCE=false` (default), the Content Security Policy only
   reports. If you see CSP warnings, see [deployment.md](deployment.md#content-security-policy).

---

## Using the app day to day

| Task | How |
|---|---|
| Switch to another event | `npm run setup` and pick the event, or change `KALTURA_EVENT_ID` in `.env` |
| Show a specific session | Pin it in `npm run setup` or set `KALTURA_SESSION_ID`. Attendees can also use the session switcher (several webcasts) or `/session?id=<entryId>`. |
| Add an attendee | Invite them in Event Platform, then (local mode) `npm run add-user -- their@email` |
| Remove access | Remove or block the user in Event Platform. Access is checked at every sign-in. In local mode you can also delete them from `users.json`. |
| Make someone a chat moderator | Give them the **Moderator** role in Event Platform; it applies at their next sign-in |
| Change look & feel | `SITE_TITLE`, `BRAND_COLOR`, `CNC_THEME_MODE` in `.env`; styles in `public/styles.css` |
| See why a sign-in failed | The server terminal logs `[login] failed for "<user>": <reason>` |

Restart the server after changing `.env`.
