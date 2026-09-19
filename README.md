# InstaInfluence

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
| API | `app/api/search`, `app/api/outreach` | JSON endpoints used by the UI |
| UI | `app/page.tsx`, `app/globals.css` | Discover · Selected · Compose · Results |

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

### Sending

- **Email** — sent over your own SMTP account when `SMTP_*` is set; otherwise the message is
  prepared and reported as a draft.
- **Instagram / other networks** — these have no compliant API for cold messages, so the app
  renders the personalised text per recipient and gives a direct link to the conversation
  (`ig.me/m/<handle>`, Telegram, TikTok, …) that you open from the Results view.

Message placeholders: `{{name}}`, `{{username}}`, `{{followers}}`, `{{category}}`, `{{city}}`,
`{{country}}`.
