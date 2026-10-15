# Reviews scraper

Scrapes the Elfsight Google Reviews widget on a live page with Playwright, writes
`public/reviews.json`, publishes it with GitHub Pages, and optionally POSTs the JSON to webhooks.

## Setup
1. Create a new GitHub repo and upload everything in this folder (including the hidden `.github` folder).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. (Optional) **Settings → Secrets and variables → Actions → New secret**:
   `DESTINATIONS` = comma-separated webhook URLs.
4. Edit `TARGET_URL` in `.github/workflows/scrape.yml` if your page is different.
5. **Actions → Scrape reviews and publish → Run workflow**.

Feed: `https://<user>.github.io/<repo>/reviews.json`
Demo: `https://<user>.github.io/<repo>/example.html`

Runs automatically every 6 hours. Change the cron line to adjust.
