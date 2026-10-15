import fs from "node:fs";
import * as cheerio from "cheerio";
import { chromium } from "playwright";

const TARGET_URL = process.env.TARGET_URL;
const DESTINATIONS = (process.env.DESTINATIONS || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!TARGET_URL) throw new Error("TARGET_URL is not set");

const num = (s) => parseFloat((s || "").match(/[\d.]+/)?.[0]);

async function getRenderedHtml(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 45000 });

    // Elfsight widgets can be lazy-loaded: find the container and scroll to it
    const container = page.locator('[class*="elfsight-app-"]').first();
    await container.waitFor({ state: "attached", timeout: 20000 });
    await container.scrollIntoViewIfNeeded();

    await page.waitForSelector(".es-review-container", { timeout: 30000 });

    const total = await page
      .$eval(".es-header-rating-reviews-count", (el) => parseInt(el.textContent.replace(/\D/g, ""), 10))
      .catch(() => 0);

    // Page through the carousel so lazy-loaded reviews render
    let stale = 0;
    for (let i = 0; i < 200 && stale < 3; i++) {
      const before = await page.locator(".es-review-container").count();
      if (total && before >= total) break;

      const next = page.locator(".es-carousel-arrow-control-container-next");
      if (!(await next.isVisible())) break;
      await next.click();
      await page.waitForTimeout(400);

      const after = await page.locator(".es-review-container").count();
      stale = after > before ? 0 : stale + 1;
    }
    return await page.content();
  } finally {
    await browser.close();
  }
}

function extract(html) {
  const $ = cheerio.load(html);
  const reviews = $(".es-review-container")
    .map((_, el) => {
      const r = $(el);
      return {
        author: r.find(".es-review-author-name").text().trim(),
        rating: num(r.find(".es-review-content-rating").attr("aria-label")),
        text: r.find(".es-text-shortener").first().text().trim(),
        postedRelative: r.find(".es-review-info-date").text().trim(),
        verified: r.find(".es-verified-badge").length > 0,
      };
    })
    .get();

  return {
    source: "google",
    overallRating: num($(".es-header-rating").attr("aria-label")),
    totalReviews: num($(".es-header-rating-reviews-count").text()),
    reviewsCaptured: reviews.length,
    reviews,
    extractedAt: new Date().toISOString(),
  };
}

const data = extract(await getRenderedHtml(TARGET_URL));
console.log(`Captured ${data.reviewsCaptured} of ${data.totalReviews} reviews`);

// Don't overwrite good data with an empty scrape
if (data.reviewsCaptured === 0) throw new Error("No reviews captured, aborting");

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/reviews.json", JSON.stringify(data, null, 2));

const results = await Promise.allSettled(
  DESTINATIONS.map(async (d) => {
    const res = await fetch(d, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${d}: HTTP ${res.status}`);
  })
);
results.forEach((r, i) => {
  if (r.status === "rejected") console.error(`Destination ${i + 1} failed:`, r.reason.message);
});
