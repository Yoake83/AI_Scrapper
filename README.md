# Cherry Picked 🍒

A full-stack AI web scraper with a cherry-cola and peach palette, animated cherry illustration, responsive layout, loading state, and copyable summaries. Paste a public webpage URL and get a concise overview plus key takeaways powered by **Groq**.

## Stack

- **Frontend:** HTML, CSS, vanilla JavaScript; served by the backend.
- **Backend:** Node.js 22+, Express, Cheerio for HTML extraction.
- **AI:** Groq Chat Completions API, `llama-3.3-70b-versatile` by default. Use a Groq free-tier account; no OpenAI key is needed. Free-tier availability and limits are controlled by Groq.

## Run locally

1. Install [Node.js](https://nodejs.org/) 22 or later (tested with 24.19.0).
2. Clone and enter the repository:
   ```sh
   git clone https://github.com/Yoake83/AI_Scrapper.git
   cd AI_Scrapper
   npm ci
   ```
3. Create **`.env` in the repository root**, next to `server.js`:
   ```sh
   cp .env.example .env
   ```
4. Create a free Groq API key at [Groq Console](https://console.groq.com/keys) and set it in `.env`:
   ```dotenv
   GROQ_API_KEY=your_groq_key_here
   GROQ_MODEL=llama-3.3-70b-versatile
   PORT=3000
   ```
   Keep the actual key private. `.env` is ignored by Git. The key is used only by the backend and is never sent to the browser.
5. Start the backend and frontend together:
   ```sh
   npm run dev
   ```
   Open `http://localhost:3000`. There is no separate frontend install or build step. For production use `npm start`.
6. Paste a public, text-rich HTML article and click **Summarize**. The app shows loading feedback, the summary, source link, and source word count.

## Tests

```sh
npm test
```

Tests cover HTML extraction, content limits, URL and private-address protection, frontend serving, the API pipeline, missing-key errors, rate limits, and the Groq request/response contract. AI API calls are mocked in tests, so no key or quota is required. To verify actual AI generation, run the app with a valid Groq key and summarize a public article.

## Deploy to Render

This repository includes `render.yaml` for a single free web service serving both frontend and backend.

1. Sign in at [Render](https://dashboard.render.com/), select **New → Blueprint**, and connect this public GitHub repository.
2. Select `main`; Render reads `render.yaml`.
3. Enter `GROQ_API_KEY` securely in Render's environment settings when prompted. Do not put it in a GitHub file.
4. Deploy. Build command: `npm ci`; start command: `npm start`; health path: `/api/health`. Render supplies `PORT`.
5. Open the HTTPS URL Render assigns and test an article summary. Copy that URL for your submission.

Alternatively create a Node Web Service with the same commands and environment variables. Render free services may sleep when idle and take time to wake up. No persistent database is required.

**Live URL:** Add the hosting provider's assigned URL after deployment. A live deployment is not included merely by pushing this repository.

## API

`POST /api/summarize` with `Content-Type: application/json`:

```json
{"url":"https://example.com/article"}
```

Success returns `title`, final `url`, plain-text `summary`, `wordCount`, and `truncated`. Errors return an `error` message with an appropriate HTTP status. `GET /api/health` returns `status` and `aiConfigured` (presence of the key, not a credential validity check).

## Scope and safeguards

- Scrapes basic HTML; it does not render JavaScript, bypass login, or bypass bot protection. Some websites reject automated requests.
- Prefers the first `article`, then `main`, then body text, excluding scripts, navigation, and other common clutter.
- Limits pages to 2 MiB, follows at most four redirects, and sends up to 12,000 characters to Groq. Long pages show an excerpt notice. If Groq rejects the request as too large, the app retries once with 6,000 characters.
- Only public HTTP(S) addresses on standard ports are accepted. Every redirect is checked; DNS addresses are validated and pinned per connection to protect against SSRF and DNS rebinding. TLS verification remains enabled.
- Scraping times out after 15 seconds; the AI call after 30 seconds. Ten API requests per minute per observed client IP are allowed. Behind a reverse proxy the default may share a limit across clients; configure trusted proxies carefully if scaling.
- No scraped pages or summaries are stored. Webpage text is sent to Groq for processing. Avoid submitting confidential pages. AI output may miss details; check the original source.
- Keyboard focus styles, accessible labels and status messages, and reduced-motion support are included.
