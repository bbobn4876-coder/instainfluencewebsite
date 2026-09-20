# Loomera

Influencer discovery and outreach for Instagram: pick a geo, pull public profiles with the
contacts stated in their bio (email, phone, links to their other networks), select the ones you
want and run outreach from the same screen.

Black UI with a blurred burgundy gradient, Inter/Helvetica, navigation on the left and every
control docked at the bottom.

## Run

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

## How it works

| Layer | File | Notes |
| --- | --- | --- |
| Data providers | `lib/providers.ts` | Apify → Instagram Graph → generated sample data |
| Contact parsing | `lib/contacts.ts` | Emails (incl. `name (at) domain.com`), phones, social links |
| Outreach | `lib/outreach.ts` | SMTP sending + drafts for Instagram and other networks |
| Inbox | `lib/inbox.ts`, `app/api/inbox` | IMAP, Telegram and Instagram replies |
| Account settings | `lib/settings.ts`, `app/api/settings` | Sender account, social handles, language |
| Translations | `lib/i18n.ts` | EN/RU strings |
| API | `app/api/search`, `app/api/outreach` | JSON endpoints used by the UI |
| UI | `app/page.tsx`, `app/globals.css` | Discover · Selected · Compose · Results · Inbox · Settings |
| Profile popup | `app/ProfileModal.tsx` | Avatar, full bio, contacts and links for one account |
| Dropdowns | `app/Select.tsx` | Searchable single/multi select used for geo and niche |

### Keyboard

| Key | Action |
| --- | --- |
| `1` … `6` | Switch between Discover, Selected, Compose, Results, Inbox and Settings |
| `Alt` + `1` … `6` | Same, and works while a field has focus |
| `⌘/Ctrl` + `B`, `[` | Collapse the sidebar to icons (remembered between visits); hovering the logo shows the same toggle |

Geo and niche both take several values at once, or **All**, which drops that constraint
entirely. The search spreads its result limit across every country/niche combination and merges
the results by follower count; with All selected the term is left out of the provider query, so
the Apify actor gets a short search string instead of dozens of joined keywords.

### Data sources

Without credentials the app runs on a deterministic generated dataset, so the whole flow is
usable offline. Configure either provider in `.env.local` to get real profiles:

- **Apify** (`APIFY_TOKEN`) — keyword/geo search across profiles, returns bios, follower counts,
  business email and external URL.
- **Instagram Graph API** (`IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`) — official, but its
  business-discovery endpoint only resolves one exact handle at a time, so use the keyword field
  as a handle lookup.

Only publicly visible profile fields are read. Check Instagram's terms and your local data
protection rules (GDPR/CAN-SPAM) before running outreach at scale, and keep a real unsubscribe
path in your message.

### Settings page

Open **Settings** (hotkey `6`) to connect the account outreach is sent from. Pick a provider
(Gmail, Outlook, Yandex, Mail.ru, Zoho, Resend, SendGrid or custom), type the address and an app
password — SMTP and IMAP hosts, ports and logins are filled in from the preset, and typing a
known address picks the provider by itself. Hosts stay editable under **Advanced**. The social
handles you write from, the Telegram bot token and the interface language (EN/RU) live here too.

There is no user login — the app is single-tenant and runs on your own server — so instead of a
sign-out there is **Disconnect account**, which wipes the saved mail credentials, handles and bot
token from `.data/settings.json`.

Settings are written to `.data/settings.json` (mode 600, git-ignored) on the server running the
app; override the location with `DATA_DIR`. The password is never sent back to the browser — the
UI only learns whether one is stored. The `SMTP_*` env vars still work as defaults when nothing
is saved yet. **Test connection** runs an SMTP handshake without sending anything.

### Inbox

The **Inbox** page (hotkey `5`) collects replies and filters them by channel:

- **Email** — read over IMAP with the account from Settings (login falls back to the SMTP one).
- **Telegram** — chats that wrote to the bot whose token is saved in Settings.
- **Instagram** — conversations from the Messaging API, which needs `IG_ACCESS_TOKEN` and
  `IG_BUSINESS_ACCOUNT_ID`; Meta only exposes threads where the other side wrote first.

A channel without credentials shows `—` on its filter and explains what is missing instead of
failing the whole page.

### Sending

- **Email** — sent over your own SMTP account when `SMTP_*` is set; otherwise the message is
  prepared and reported as a draft.
- **Instagram / other networks** — these have no compliant API for cold messages, so the app
  renders the personalised text per recipient and gives a direct link to the conversation
  (`ig.me/m/<handle>`, Telegram, TikTok, …) that you open from the Results view.

Message personalisation uses plain words instead of a placeholder syntax: write **Name**,
**Username**, **Followers**, **Niche**, **City** or **Country** (or their Russian spellings) and
each recipient gets their own value. The words are highlighted as you type, and matching is
case-sensitive, so "name" in an ordinary sentence is left alone. The highlight is drawn by a mirror layer that shares the
input's exact metrics — the chip adds no padding and no bold — so the caret never drifts. When a
word is completed its letters lift and land in a left-to-right wave; they are split into boxes
only for those few hundred milliseconds and go back to plain text afterwards. See `lib/tokens.ts`.
