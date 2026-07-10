/**
 * Post-build prerender: generates one static HTML file per tool page so
 * crawlers receive full content, meta tags and structured data without JS.
 * Also emits sitemap.xml and robots.txt. Runs after `vite build`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Single source of truth for the deployed origin.
// Swap to the custom domain (e.g. https://loficonverter.com) once purchased.
const SITE_URL = 'https://lofi-audio-converter.pages.dev';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = join(rootDir, 'dist');

const seoData = JSON.parse(readFileSync(join(rootDir, 'src', 'seo', 'pages.json'), 'utf8'));
const template = readFileSync(join(distDir, 'index.html'), 'utf8');

const escapeHtml = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const escapeJsonLd = (json) => json.replaceAll('</', '<\\/');

const canonicalUrl = (path) => (path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`);

function buildHeadTags(page) {
  const url = canonicalUrl(page.path);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: page.h1,
        url,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: page.description,
        browserRequirements: 'Requires JavaScript and a modern browser with Web Audio API support.'
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a }
        }))
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: seoData.siteName, item: `${SITE_URL}/` },
          ...(page.path === '/'
            ? []
            : [{ '@type': 'ListItem', position: 2, name: page.h1, item: url }])
        ]
      }
    ]
  };

  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(seoData.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    `<script type="application/ld+json">${escapeJsonLd(JSON.stringify(jsonLd))}</script>`
  ].join('\n    ');
}

function buildStaticContent(page) {
  const otherPages = seoData.pages.filter((p) => p.toolId !== page.toolId);
  const steps = page.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('\n          ');
  const faq = page.faq
    .map(
      ({ q, a }) =>
        `<section><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></section>`
    )
    .join('\n          ');
  const links = otherPages
    .map((p) => `<li><a href="${p.path}">${escapeHtml(p.h1)}</a></li>`)
    .join('\n          ');

  // This static snapshot is replaced by the React app on load; it exists so
  // crawlers and no-JS user agents receive the full page content.
  return `
      <main style="max-width:760px;margin:0 auto;padding:2rem 1.25rem;font-family:system-ui,sans-serif;color:#eae5db;background:#141210">
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.intro)}</p>
        <h2>How to use it</h2>
        <ol>
          ${steps}
        </ol>
        <h2>Frequently asked questions</h2>
          ${faq}
        <h2>More free audio tools</h2>
        <ul>
          ${links}
        </ul>
        <p><em>Loading the interactive tool… JavaScript is required for audio processing.</em></p>
      </main>`;
}

function renderPage(page) {
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[\s\S]*?"\s*\/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`
  );
  html = html.replace('</head>', `    ${buildHeadTags(page)}\n  </head>`);
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${buildStaticContent(page)}\n    </div>`
  );

  return html;
}

const today = new Date().toISOString().slice(0, 10);

for (const page of seoData.pages) {
  const html = renderPage(page);
  if (page.path === '/') {
    writeFileSync(join(distDir, 'index.html'), html);
  } else {
    const pageDir = join(distDir, page.path.replaceAll('/', ''));
    mkdirSync(pageDir, { recursive: true });
    writeFileSync(join(pageDir, 'index.html'), html);
  }
}

const sitemapEntries = seoData.pages
  .map(
    (page) => `  <url>
    <loc>${canonicalUrl(page.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.path === '/' ? '1.0' : '0.8'}</priority>
  </url>`
  )
  .join('\n');

writeFileSync(
  join(distDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`
);

writeFileSync(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Prerendered ${seoData.pages.length} pages + sitemap.xml + robots.txt into dist/`);
