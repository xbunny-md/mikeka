# SportyBet Odds Hunter

Production analytics platform, automated daily odds factory, genuine booking-code generator, and **Cross-Bookmaker Bet Transfer** engine supporting **SportyBet Tanzania** (`https://www.sportybet.com/tz/m/`) and **betPawa Tanzania** (`https://www.betpawa.co.tz/bets`), backed by a **Vercel Serverless API** and **Firebase Auth + Firestore**.

## Architecture Overview

- **Frontend (Vite + React 19 + Tailwind CSS v4)**: Modular SPA with deep-link URL routing (`/`, `/transfer`, `/admin`, `/settings`, `/favorites`, `/history`, etc.), persistent Firebase Auth sessions (Email/Password signup, login, password reset, email verification, and Google Sign-In), Light/Dark mode, and multi-bookmaker isolation.
- **Vercel Serverless Backend (`/api/index.ts` -> `/backend/app.ts`)**: Express API compiled directly by Vercel with security headers, Zod payload validation, `express-rate-limit` throttling, Firebase ID token verification (`firebase-admin` / public certs), structured audit logging, and `/api/cron/*` endpoints for Vercel Cron Jobs.
- **Cross-Bookmaker Bet Transfer (`/api/transfer/*`)**:
  - Bidirectional support (`SportyBet TZ → betPawa TZ` and `betPawa TZ → SportyBet TZ`).
  - Attempts authorized booking code lookup or falls back cleanly to manual selection import (`MANUAL_IMPORT_REQUIRED`).
  - Matches exact fixtures (squad-qualifier isolation for Women/Youth/Reserves, team-name conflict guards like United vs City, and kickoff delta check) and strict canonical markets/lines/periods (1X2, Double Chance 1X/12/X2, Over/Under exact line, BTTS, Draw No Bet, Odd/Even, Asian Handicap, and 1st-Half markets).
  - **Never substitutes outcomes** and **never fabricates booking codes**: unavailable legs are flagged clearly, target odds are recalculated from live bookmaker quotes, and genuine target booking codes are issued only after user review & confirmation.

## Configuration

SportyBet Tanzania, betPawa Tanzania, Firebase Client SDK (`projectId: gen-lang-client-0092843012`), and default authorized admin identities are hardcoded directly in the codebase (`src/firebase/config.ts`, `backend/firebase/admin.ts`, `backend/config/sportybet.ts`, `backend/config/bookmakers.ts`, and `backend/middleware/adminAuth.ts`) so the application runs immediately without manual `.env` setup.

For optional Vercel production enhancements (such as Admin Firestore sync or Vercel Cron authentication), you may optionally add `CRON_SECRET` and `FIREBASE_SERVICE_ACCOUNT_JSON` (or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`) in **Vercel Dashboard → Project Settings → Environment Variables**.

## Deploying to Vercel (From GitHub)

1. Push your repository to GitHub and import it into **Vercel**.
2. Vercel auto-reads `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Serverless Function**: `/api/index.ts` (bundles `firebase-applet-config.json`)
   - **Vercel Cron Jobs** (configured in `vercel.json`):
     - `GET /api/cron/daily-factory` (`0 5 * * *` UTC)
     - `GET /api/cron/track-results` (`0 17 * * *` UTC)
3. Deploy. Verify `/api/health`, `/api/platform/status`, and `/transfer` on your live Vercel domain.

## Firebase Console Configuration Checklist

1. Open **Firebase Console → Authentication → Sign-in method** and ensure **Email/Password** and **Google** providers are enabled.
2. Open **Firebase Console → Authentication → Settings → Authorized domains** and add your Vercel production domain (e.g., `your-project.vercel.app`) and custom domains.
3. Keep Firestore rules deployed (`firestore.rules` enforces `email_verified == true` for user-scoped writes and admin RBAC).

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server (Express API + Vite middleware on port `3000`):
   ```bash
   npm run dev
   ```

## Testing & Verification

```bash
npm run lint
npx eslint firestore.rules
npm test
npm run build
```

## Bookmaker Integration & Compliance Notes

- Zero bet placement, zero deposits, zero withdrawals, and zero bookmaker credential collection.
- Upstream bookmaker APIs (`SportyBet TZ` and `betPawa TZ`) are public sportsbook read/share endpoints; if an upstream endpoint throttles requests, returns an unsupported market, or rejects an expired booking code, the system reports the exact status (`MANUAL_IMPORT_REQUIRED`, `UNAVAILABLE`, `UNMATCHED`, or `FAILED`) and provides direct manual handoff links (`https://www.sportybet.com/tz/m/` and `https://www.betpawa.co.tz/bets`) rather than fabricating booking codes.
- Note on Serverless Persistence: On Vercel Serverless Functions, local filesystem state resides in ephemeral `/tmp` across cold starts. Configure Firebase Admin service account credentials (`FIREBASE_SERVICE_ACCOUNT_JSON`) alongside client-side Firestore sync so verified user transfers, favorites, and admin configs persist durably in Firestore.
