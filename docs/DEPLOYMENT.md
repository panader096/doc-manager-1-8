# Deployment

Deploys are driven entirely by GitHub Actions calling the Vercel CLI — Vercel's
own git-triggered auto-deploys are disabled (`vercel.json`,
`git.deploymentEnabled: false`).

- `.github/workflows/deploy-preview.yml` — runs when a PR merges into `main`;
  deploys a Vercel **preview** build.
- `.github/workflows/deploy-production.yml` — runs when a PR merges into
  `production`; deploys to Vercel **production**.

Both workflows need three repo secrets (Settings → Secrets and variables →
Actions): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

To ship to production: merge your change into `main` first (produces a
preview build), then open a PR from `main` into `production` and merge it.
