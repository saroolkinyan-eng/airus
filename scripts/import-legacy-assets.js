const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ORIGIN = 'https://climber74.ru';
const MAX_ASSETS = 250;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

const seedPages = [
  '/', '/news/', '/cleaning/', '/cleaning/balcony', '/roof', '/installation', '/facade_works'
];

// Explicitly keep the key public media used by the current site even if a crawler misses it.
const requiredStaticPaths = [
  '/static/assets/img/gallery/cleaning.jpg',
  '/static/assets/img/gallery/roof.jpg',
  '/static/assets/img/gallery/installation.png',
  '/static/assets/img/gallery/facade.jpg',
  '/static/assets/img/team/zQMtzEW3CHY.jpg',
  '/static/assets/img/team/oFat3FmJHZU.jpg',
  '/static/assets/img/team/30258560064853005_3dbb.jpg',
  '/static/assets/img/team/photo_2022-07-11_12-45-57.jpg'
];

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'AIRUS legacy static mirror/2.0',
        'Accept': '*/*'
      },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchBuffer(next, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        data: Buffer.concat(chunks),
        contentType: String(res.headers['content-type'] || '')
      }));
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

function toSameOriginStaticUrl(ref, baseUrl) {
  if (!ref) return null;
  const trimmed = String(ref).trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('#')) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (url.origin !== ORIGIN) return null;
    if (!url.pathname.startsWith('/static/')) return null;
    url.hash = '';
    return url;
  } catch (_) {
    return null;
  }
}

function extractHtmlStaticRefs(html, baseUrl) {
  const out = [];
  const attrRe = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    const u = toSameOriginStaticUrl(m[1], baseUrl);
    if (u) out.push(u);
  }
  return out;
}

function extractCssStaticRefs(cssText, baseUrl) {
  const out = [];
  const patterns = [
    /url\(\s*([^)]+?)\s*\)/gi,
    /@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(cssText))) {
      const u = toSameOriginStaticUrl(m[1], baseUrl);
      if (u) out.push(u);
    }
  }
  return out;
}

function targetForStaticUrl(url) {
  const safePath = decodeURIComponent(url.pathname).replace(/\\/g, '/');
  if (!safePath.startsWith('/static/')) throw new Error('Unsafe static path');
  return path.join(PUBLIC_DIR, safePath.slice(1));
}

async function main() {
  const queue = [];
  const queued = new Set();
  const completed = [];
  const failures = [];
  let totalBytes = 0;

  function enqueue(url) {
    if (!url || queued.has(url.href) || queue.length + completed.length >= MAX_ASSETS) return;
    queued.add(url.href);
    queue.push(url);
  }

  // Discover original stylesheets, scripts, images, fonts and CSS backgrounds from live pages.
  for (const route of seedPages) {
    const pageUrl = new URL(route, ORIGIN).toString();
    try {
      const { data } = await fetchBuffer(pageUrl);
      const html = data.toString('utf8');
      for (const u of extractHtmlStaticRefs(html, pageUrl)) enqueue(u);
    } catch (err) {
      failures.push({ url: pageUrl, error: err.message, kind: 'page-discovery' });
      console.warn(`[legacy] cannot inspect ${pageUrl}: ${err.message}`);
    }
  }

  for (const p of requiredStaticPaths) enqueue(new URL(p, ORIGIN));

  while (queue.length && completed.length < MAX_ASSETS && totalBytes < MAX_TOTAL_BYTES) {
    const url = queue.shift();
    const target = targetForStaticUrl(url);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    try {
      let data;
      let contentType = '';
      const existing = fs.existsSync(target) ? fs.statSync(target).size : 0;
      if (existing > 32) {
        data = fs.readFileSync(target);
        contentType = target.endsWith('.css') ? 'text/css' : '';
        console.log(`[legacy] exists: ${url.pathname} (${existing} bytes)`);
      } else {
        const result = await fetchBuffer(url.toString());
        data = result.data;
        contentType = result.contentType;
        if (!data.length) throw new Error('Empty file');
        fs.writeFileSync(target, data);
        console.log(`[legacy] copied: ${url.pathname} (${data.length} bytes)`);
      }

      totalBytes += data.length;
      completed.push({ source: url.toString(), path: url.pathname, bytes: data.length });

      const isCss = /text\/css/i.test(contentType) || url.pathname.toLowerCase().endsWith('.css');
      if (isCss) {
        const text = data.toString('utf8');
        for (const child of extractCssStaticRefs(text, url.toString())) enqueue(child);
      }
    } catch (err) {
      failures.push({ url: url.toString(), error: err.message, kind: 'asset' });
      console.warn(`[legacy] cannot copy ${url.pathname}: ${err.message}`);
    }
  }

  const manifestDir = path.join(PUBLIC_DIR, 'static');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, 'airus-legacy-manifest.json'), JSON.stringify({
    importedAt: new Date().toISOString(),
    origin: ORIGIN,
    assetsCopiedOrPresent: completed.length,
    failures: failures.length,
    totalBytes,
    files: completed,
    errors: failures
  }, null, 2));

  if (completed.length) {
    console.log(`[legacy] mirror ready: ${completed.length} assets, ${totalBytes} bytes.`);
  } else {
    console.warn('[legacy] no legacy assets were copied. Browser fallbacks will be used where possible.');
  }
  if (failures.length) console.warn(`[legacy] ${failures.length} legacy request(s) failed.`);
}

main().catch(err => {
  // Do not make npm install fail solely because the old site is temporarily unavailable.
  console.warn('[legacy] importer skipped:', err.message);
  process.exitCode = 0;
});
