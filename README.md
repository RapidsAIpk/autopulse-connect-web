# AutoPulse Connect web (Next.js)

The browser side of **AutoPulse Connect** (https://connect.autopulse.ai). The server is the separate repo
`autopulse-connect-api` (NestJS); its README and `docs/` describe dealers, access, billing and the feature & test sheet.

## What lives where

| URL | What | Source |
| --- | --- | --- |
| `/` | Public website (features, how it works, pricing from Billing, FAQ, demo) | `src/app/(site)/page.tsx`, `src/components/site/WebsiteBits.tsx`, `public/assets/site.css` |
| `/admin` | The dashboard (inbox, leads, appointments, vehicles, visitors, team, pages, stores, settings…) | `src/app/(app)/admin/page.tsx` → `src/legacy/*` (the original app, ported) |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/demo`, `/contact` | Sign-in and public forms | `src/app/(auth)/…` |
| `/privacy`, `/terms` | Legal pages | `src/app/(legal)/…` |
| `/widget-test` | Website chat test page | `src/app/(widget)/…` |
| `/manual`, `/overview` | User manual and app overview (static) | `public/manual.html`, `public/overview.html` |
| `/api/*`, `/widget.js`, `/cars/*`, `/d/*`, `/sheet/*`, `/media/*`… | Sent to the API | `next.config.ts` rewrites |

- `src/proxy.ts`: `/admin` without a session goes to `/login`; `/login` with a session goes to `/admin`.
- Links made before the dashboard moved (`/#view=`, `/#chat=`, `/#login-as=`, `/#billing=`) are forwarded from `/` to
  `/admin`.
- In-app Help (pop-ups, ? icons, tours) is `public/assets/help.js`. Its texts are also the feature rows of the test
  sheet, so update them when a screen changes.

## Develop

```bash
npm install
API_ORIGIN=http://localhost:4009 npm run dev     # needs the API running
npx tsc --noEmit && npx eslint src && npx next build
```

Merging to `main` builds and deploys to AWS (GitHub Actions). See `AGENTS.md` for the Next.js version notes.
