# SEO Strategy — Lofi Audio Converter

Goal: rank free browser-based audio tools in premium English markets (US, UK, CA, AU).
Site: https://lofi-audio-converter.pages.dev/ → move to **loficonverter.com**

---

## 1. Current state: the site CANNOT rank as-is

The app is great for users but nearly invisible to Google:

| # | Problem | Why it kills rankings |
|---|---------|----------------------|
| 1 | Client-rendered React SPA | The HTML Google receives is an empty `<div id="root">`. All visible text arrives via JavaScript. Bing and AI crawlers (ChatGPT, Perplexity) index almost nothing. |
| 2 | All 10 tools live on ONE URL | You cannot rank for "vocal remover" and "slowed and reverb" and "8d audio" with a single page. Each tool needs its own URL. |
| 3 | Metadata missing | Title only ("Lofi Audio Converter"). No meta description, no Open Graph tags, no canonical, no favicon. |
| 4 | No robots.txt / sitemap.xml | SPA fallback serves fake ones (the app HTML). Google gets no crawl guidance. |
| 5 | Zero schema markup | No WebApplication, FAQPage, or Breadcrumb structured data → no rich results. |
| 6 | Zero written content | No how-to text, no FAQs, no explanations. Thin content = no long-tail rankings. |
| 7 | Zero backlinks, new domain | No authority signals yet. |
| 8 | .pages.dev subdomain | Fine for testing; a custom .com is stronger for trust and branding. |

**Strengths to build on:** blazing-fast static hosting on Cloudflare's global CDN (great Core Web Vitals for free), genuinely useful free tools (natural link magnet), and a killer privacy angle — *audio never leaves the user's browser* (no upload!). Competitors upload files to servers; we don't. That's the marketing hook.

---

## 2. Domain recommendation

Availability verified via RDAP registry lookup on 2026-07-10:

| Domain | Status | Verdict |
|--------|--------|---------|
| **loficonverter.com** | ✅ AVAILABLE | **BUY THIS.** Exact match for the product name and a real search term, .com, memorable. |
| audiolofi.com | ✅ available | Good brandable backup. |
| lofiforge.com | ✅ available | Brandable backup, less keyword value. |
| lofitools.com, lofiaudio.com, lofilab.com, slowedreverb.com, lofikit.com, lofisound.com, lofistudio.com | ❌ taken | — |

**Premium-country targeting:** a `.com` is correct — do NOT buy ccTLDs (.co.uk, .com.au). Geographic relevance for US/UK/CA/AU comes from: English content (US spelling), links from US/UK sites, and Cloudflare's global CDN. A gTLD ranks everywhere.

Optionally also grab audiolofi.com (~$10/yr) and redirect it, to protect the brand.

---

## 3. Keyword landscape (estimates from training knowledge — validate in GSC/keyword tools after launch)

| Keyword cluster | Est. global volume | Competition | Priority |
|-----------------|-------------------|-------------|----------|
| lofi converter / lofi music maker | low (5–10k/mo) | LOW | 🟢 Quick win, matches brand |
| slowed and reverb (maker/generator) | mid (50–150k) | MEDIUM (slowedandreverb.studio etc.) | 🟢 Primary target |
| 8d audio converter | mid-low (20–50k) | MEDIUM | 🟢 Primary target |
| song key & bpm finder | mid (100k+) | MEDIUM-HIGH (tunebat.com) | 🟡 Secondary |
| audio to video converter | mid | MEDIUM | 🟡 Secondary |
| vocal remover | huge (500k–1M+) | VERY HIGH (vocalremover.org) | 🔴 Long-term |
| audio cutter / joiner | high | VERY HIGH (123apps/mp3cut) | 🔴 Long-term |

Main competitors: vocalremover.org, audioalter.com, tunebat.com, 123apps.com, slowedandreverb.studio, twistedwave.com.

Strategy: win the low-competition lofi/slowed-reverb/8D cluster first (months 1–4), use that authority to attack the giant keywords later.

---

## 4. Implementation roadmap

### Phase 1 — Technical foundation (weeks 1–2) ← blocks everything else
- [ ] Buy loficonverter.com, attach to Cloudflare Pages, 301 from .pages.dev
- [ ] Add React Router: one URL per tool (`/vocal-remover`, `/slowed-and-reverb`, `/8d-audio`, `/pitch-and-tempo`, `/bpm-key-finder`, `/audio-cutter`, `/audio-joiner`, `/audio-to-video`, `/voice-recorder`; homepage = lofi converter)
- [ ] Pre-render every route to static HTML at build time (SSG) so crawlers see full content without JS
- [ ] Unique `<title>` + meta description + canonical + Open Graph/Twitter tags + favicon per page
- [ ] Real robots.txt + sitemap.xml (auto-generated at build)
- [ ] Schema per page: WebApplication + FAQPage + BreadcrumbList (JSON-LD)
- [ ] Register Google Search Console + Bing Webmaster Tools, submit sitemap
- [ ] Privacy-friendly analytics (Cloudflare Web Analytics — free, no cookie banner needed)

### Phase 2 — On-page content (weeks 3–6)
- [ ] Each tool page: H1, 300–600 words (what it does, 3-step how-to, 5-question FAQ), "100% private — audio never leaves your browser" badge
- [ ] Homepage: position as "Free online audio toolkit — no upload, no signup"
- [ ] Internal links between related tools (slowed+reverb ↔ lofi ↔ 8D)
- [ ] 8 blog posts targeting long-tails: "how to make a slowed and reverb edit", "how to remove vocals from any song free", "what is 8d audio and how does it work", "how to find the BPM and key of a song", etc.

### Phase 3 — Authority & links (months 2–4)
- [ ] Launch on Product Hunt + relevant subreddits (r/WeAreTheMusicMakers, r/lofihiphop, r/musicproduction) — genuine posts, not spam
- [ ] Submit to free-tool directories and AlternativeTo
- [ ] Short YouTube/TikTok tutorials (slowed-reverb content is huge there) linking back
- [ ] Outreach to music-production blogs for "best free tools" listicles

### Phase 4 — Scale (months 4–12)
- [ ] Attack high-volume keywords (vocal remover, audio cutter) once DA grows
- [ ] Add high-demand tools (MP3 converter, volume booster, noise remover) — each a new ranking page
- [ ] GEO/AI-search: llms.txt, quotable passage formatting → get cited by ChatGPT/Perplexity
- [ ] Quarterly content refresh based on GSC query data

---

## 5. KPI targets (realistic for a new domain)

| Metric | Month 1 | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|---------|----------|
| Indexed pages | 12+ | 20+ | 30+ | 45+ |
| Organic visits/mo | ~0 | 1–3k | 10–30k | 60–150k |
| Ranking keywords (top 100) | 20 | 150 | 500 | 1,500+ |
| Referring domains | 2 | 15 | 40 | 100+ |
| Core Web Vitals | all green (already fast) | green | green | green |

Free tools grow on a power curve — slow for 3–4 months, then compounding once links and trust accumulate.
