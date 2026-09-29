# Bahi: digital khata for shopkeepers

Bahi (بہی, from *bahi khata*) replaces the paper udhaar register at the counter. Note every sale on credit and every payment in two taps, see who owes you what, and send a polite WhatsApp reminder when it's time to collect.

Built for daily use at a kiryana store, pharmacy, milk shop, tailor or any business that gives credit, in Pakistan. **Vue 3 + Vite** front end, **Node.js (Express)** back end.

## What it does

- **Two big buttons per customer:** red **You gave** (udhaar diya) and green **You got** (paisay mile), with an amount, a note (for example "Atta 10kg") and a date.
- **Shop-counter maths:** type `450+120+85` or `3x250` in the amount box and Bahi adds it up. Quick buttons add +100, +500, +1,000, or fill in the full amount owed.
- **The khata, like on paper:** every entry with a running balance, newest first. Tap any entry to fix or delete it. Entries added later with an earlier date slot into the right place.
- **Collect today:** set the day a customer promised to pay ("Friday ko de dunga"). On that day they appear at the top of the home screen, with late ones marked, and a one-tap WhatsApp reminder.
- **WhatsApp reminder and statement:** editable messages in Urdu, Roman Urdu or English, with the customer's name and balance filled in. The statement lists their recent entries.
- **Home screen at a glance:** total you'll get, advances you hold, udhaar given today, cash collected today and this week.
- **Recent customers first,** so a regular is one tap away. Sort by most due or A–Z, and search by name, phone or note.
- **Phone number optional,** because not every customer has WhatsApp.
- **Add to home screen:** it opens like an app once it's online.
- **Private per shop:** each shop has its own login and only ever sees its own khata.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

This starts the API on http://localhost:3003 and the app on **http://localhost:5175**. Open the second one and create an account.

For production:

```bash
npm run build     # builds the Vue app into client/dist
npm start         # one server on http://localhost:3003 serves the app and the API
```

| Setting | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3003). |
| `DATA_DIR` | Where shops, customers and entries are saved (default `server/data`, not in git). Keep this on a disk that survives restarts. |
| `SESSION_SECRET` | Secret for signing login cookies. If unset, one is generated and saved in the data folder. |

Run it behind HTTPS in production: login cookies are marked `Secure` when `NODE_ENV=production`.

## Where things live

```
shared/core.js          Ledger rules used by both server and preview: balances, running totals,
                        checks, promised dates, amount maths, WhatsApp messages
server/src/app.js       API routes
server/src/auth.js      Password hashing (scrypt), signed session cookies, login limits
server/src/storage.js   Small JSON-file store with atomic writes
server/test/            API tests
client/src/views/       Pages: Login, Home, Customer khata, Add/Edit customer, Settings
client/src/components/  App bar, entry sheet, icons
client/src/lib/         API client, app state, formatting, in-browser preview API
client/public/          Home-screen icon and web app manifest
```

## API

All routes except the `auth` ones need a logged-in shop, and only touch that shop's data.

| Method | Path | What |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Accounts |
| GET | `/api/auth/me` | Current shop |
| PUT | `/api/settings` | Shop name, your name, WhatsApp messages |
| GET / POST | `/api/customers` | Customers with balances, or add one |
| GET / PUT / DELETE | `/api/customers/:id` | One customer's khata (entries with running balance), edit (name, phone, note, promised date), delete |
| POST | `/api/customers/:id/entries` | Add an entry: `{type: "gave" \| "got", amount, note, date}` |
| PUT / DELETE | `/api/entries/:id` | Edit or delete an entry |
| GET | `/api/summary` | Totals for the home screen |

A positive balance means the customer owes the shop; a negative one is an advance the shop holds.

## Tests

```bash
npm test
```

Covers accounts, login blocking, customer and entry checks, running balances (including back-dated entries and advances), editing and deleting, shop privacy, the summary, promised dates and the amount maths.

## Preview build

`npm run build:preview` makes a self-contained copy in `client/dist-preview` that runs without the server, with a demo shop (**demo@bahi.pk / demo1234**) and a sample khata. Everything is saved in the visitor's browser only. It's for showing the app; use `npm run build` + `npm start` for real use.

## Fonts

Plus Jakarta Sans and DM Mono, bundled from `client/src/assets/fonts/`, free under the SIL Open Font License.
