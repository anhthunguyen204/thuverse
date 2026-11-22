// GET /api/meta?url=<public web page>
//
// Reads a page's public metadata for Reading List and Reading Sources:
// title, site name, description, preview image (og:image, then twitter:image)
// and site icon. Images are returned as links; nothing is downloaded or stored.
//
// Safety (SSRF protection):
//   - http/https only, default ports only, no credentials in the URL
//   - every DNS answer is checked at connection time, so private, loopback,
//     link-local, carrier-grade NAT, multicast and reserved addresses are refused
//     (this also covers redirects and DNS rebinding)
//   - at most 3 redirects, each one re-validated
//   - 6 s timeout, reads at most 512 KB, HTML responses only
//   - signed-in users only (Supabase session), results cached for 6 hours
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { signedIn } from './_auth.js';

const MAX_BYTES = 512 * 1024, TIMEOUT = 6000, MAX_HOPS = 3, TTL = 6 * 3600e3;
const UA = 'Mozilla/5.0 (compatible; ThuverseBot/1.0; +https://thuverse.vercel.app)';
const cache = new Map();

/* ---------- address checks */
function v4ToInt(ip) { return ip.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0; }
const V4_BLOCK = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([b, m]) => [v4ToInt(b), m === 0 ? 0 : (~0 << (32 - m)) >>> 0]);
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) { const n = v4ToInt(ip); return V4_BLOCK.some(([b, mask]) => ((n & mask) >>> 0) === b); }
  if (net.isIPv6(ip)) {
    const a = ip.toLowerCase();
    if (a === '::' || a === '::1') return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:/.test(a)) return true;                             // other IPv4-mapped forms
    if (/^(fc|fd)/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a)) return true;   // ULA, link-local, multicast
    if (/^64:ff9b:/.test(a) || /^2001:db8:/.test(a) || /^2001:0?:/.test(a) || /^2002:/.test(a)) return true;     // NAT64, docs, Teredo, 6to4
    return false;
  }
  return true;                                                       // not an IP at all: refuse
}
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => isPrivateAddress(a.address))) { const e = new Error('blocked_address'); e.code = 'EBLOCKED'; return cb(e); }
    if (options && options.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
export function checkUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (net.isIP(h) && isPrivateAddress(h)) return null;
  if (raw.length > 2048) return null;
  u.hash = '';
  return u;
}

/* ---------- fetching */
function getOnce(u) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup: safeLookup, timeout: TIMEOUT, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', 'Accept-Language': 'en,*;q=0.5' } }, res => {
      const { statusCode: code, headers } = res;
      if (code >= 300 && code < 400 && headers.location) { res.resume(); return resolve({ redirect: headers.location }); }
      if (code !== 200) { res.resume(); return reject(Object.assign(new Error('http_' + code), { code: 'HTTP' })); }
      if (!/text\/html|application\/xhtml\+xml/i.test(headers['content-type'] || '')) { res.resume(); return reject(Object.assign(new Error('not_html'), { code: 'NOTHTML' })); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; chunks.push(c); if (size >= MAX_BYTES || /<\/head>/i.test(c.toString('latin1'))) { res.destroy(); finish(); } });
      res.on('end', finish); res.on('error', finish);
      let done = false;
      function finish() { if (done) return; done = true; resolve({ html: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8') }); }
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })));
    req.on('error', reject);
    req.end();
  });
}
async function fetchPage(start) {
  let u = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const r = await getOnce(u);
    if (r.html !== undefined) return { url: u.href, html: r.html };
    const next = checkUrl(new URL(r.redirect, u).href);
    if (!next) throw Object.assign(new Error('blocked_redirect'), { code: 'EBLOCKED' });
    u = next;
  }
  throw Object.assign(new Error('too_many_redirects'), { code: 'REDIRECTS' });
}

/* ---------- parsing (head only, no dependencies) */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
const decode = s => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();
const attrs = tag => { const o = {}; tag.replace(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (m, k, v, a, b, c) => { o[k.toLowerCase()] = a ?? b ?? c ?? ''; }); return o; };
const absUrl = (href, base) => { if (!href || !String(href).trim()) return ''; try { const u = new URL(decode(href), base); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export function parseMeta(html, base) {
  const head = (html.match(/<head[\s\S]*?(<\/head>|$)/i) || [html])[0].slice(0, MAX_BYTES);
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) { const a = attrs(m[0]); const k = (a.property || a.name || a.itemprop || '').toLowerCase(); if (k && a.content != null && !(k in meta)) meta[k] = a.content; }
  const icons = [];
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) { const a = attrs(m[0]); const rel = (a.rel || '').toLowerCase(); if (/icon/.test(rel) && a.href) icons.push({ rel, href: a.href, sizes: parseInt(a.sizes, 10) || 0 }); }
  icons.sort((x, y) => (/apple-touch/.test(y.rel) - /apple-touch/.test(x.rel)) || (y.sizes - x.sizes));
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const image = absUrl(meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '', base);
  const icon = absUrl(icons[0] ? icons[0].href : '/favicon.ico', base);
  return {
    url: absUrl(meta['og:url'] || '', base) || base,
    title: decode(meta['og:title'] || meta['twitter:title'] || titleTag || '').slice(0, 300),
    siteName: decode(meta['og:site_name'] || meta['application-name'] || '').slice(0, 120),
    description: decode(meta['og:description'] || meta['twitter:description'] || meta.description || '').slice(0, 500),
    image, icon,
    publishedAt: decode(meta['article:published_time'] || '').slice(0, 40),
    lang: decode((html.match(/<html[^>]*\blang=["']?([a-zA-Z-]+)/i) || [])[1] || '').slice(0, 12),
  };
}

function send(res, status, body, cacheable) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheable ? 'private, max-age=21600' : 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  const raw = new URL(req.url, 'http://local').searchParams.get('url') || '';
  const u = checkUrl(raw.trim());
  if (!u) return send(res, 400, { error: 'invalid_url' });
  if (!(await signedIn(req))) return send(res, 401, { error: 'sign_in_required' });
  const hit = cache.get(u.href);
  if (hit && Date.now() - hit.at < TTL) return send(res, 200, hit.body, true);
  try {
    const page = await fetchPage(u);
    const body = { ...parseMeta(page.html, page.url), host: new URL(page.url).hostname, finalUrl: page.url };
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(u.href, { at: Date.now(), body });
    return send(res, 200, body, true);
  } catch (e) {
    const map = { EBLOCKED: [400, 'blocked_address'], TIMEOUT: [504, 'timeout'], NOTHTML: [415, 'not_a_web_page'], HTTP: [502, e.message], REDIRECTS: [508, 'too_many_redirects'], ENOTFOUND: [404, 'site_not_found'] };
    const [st, err] = map[e.code] || [502, 'unreachable'];
    return send(res, st, { error: err });
  }
}
