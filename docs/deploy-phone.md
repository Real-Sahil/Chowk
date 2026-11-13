# Setting up Chowk from a phone (no laptop)

Everything runs in GitHub Actions (free: 2,000 minutes/month on private repos, free on public repos with standard runners; each run is ~2 minutes) and the Neon/Vercel websites. Nothing needs a terminal.

## One-time: add 3 GitHub secrets
GitHub (browser) → your repo → **Settings → Secrets and variables → Actions → New repository secret**:
| Secret | Value |
|---|---|
| `NEON_OWNER_URL` | Neon console → your project → **Connect** → turn **Connection pooling OFF** → copy the `postgresql://...` string (host has **no** `-pooler`) |
| `CHOWK_APP_PASSWORD` | a long random password you invent (30+ characters; letters/digits are easiest to type) |
| `CHOWK_AUTH_PASSWORD` | a **different** long random password |

## Run the database setup
GitHub → repo → **Actions** → **Chowk ops (phone-friendly)** → **Run workflow** → task `setup-db` → Run. Open the run; all steps should be green and the last step prints PASS lines. (If the Actions tab says workflows are disabled, tap "I understand my workflows, go ahead and enable them".)

## Vercel environment variables
Vercel app/site → the-chowk → **Settings → Environment Variables** (Production). Build the two URLs from Neon's **pooled** string (Connection pooling ON; host contains `-pooler`), replacing the user and password:
- `DATABASE_URL` = `postgresql://chowk_app:<CHOWK_APP_PASSWORD>@<pooled-host>/<database>?sslmode=require`
- `AUTH_DATABASE_URL` = `postgresql://chowk_auth:<CHOWK_AUTH_PASSWORD>@<pooled-host>/<database>?sslmode=require`
- `APP_ENV` = `staging`, `BETTER_AUTH_URL` = `https://the-chowk-five.vercel.app`, `BETTER_AUTH_SECRET` = a random 48+ character string, `GUEST_MODE_ENABLED` = `true`
- Never add the owner URL (`NEON_OWNER_URL`) to Vercel.
If a password contains symbols such as `@ : / ? # %`, use only letters and digits for the passwords to avoid encoding mistakes. Then **Deployments → ⋯ → Redeploy** (env changes only apply to new deployments). Vercel project settings: Root Directory `apps/web`, "Include source files outside of the Root Directory" on.

## Check it works
Actions → Chowk ops → Run workflow → task `verify-deployment` (URL pre-filled) → every line should be PASS. Task `verify-neon` checks the database setup. Share any FAIL lines with Claude.
