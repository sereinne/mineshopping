const adminPages = new Set(['/admin', '/admin/', '/admin.html']);
const recordPaths = new Map([['/api/cart-records', 'cart'], ['/api/orders', 'order']]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});
const privateHeaders = {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'};
const reply = (status, data = {}) => Response.json(data, {status, headers: privateHeaders});

async function authenticate(request, password) {
  if (!password) return false;
  const encoder = new TextEncoder();
  const expected = 'Basic ' + btoa(String.fromCharCode(...encoder.encode('admin:' + password)));
  const getDigest = text => crypto.subtle.digest('SHA-256', encoder.encode(text));
  const [actualDigest, expectedDigest] = await Promise.all([
    getDigest(request.headers.get('Authorization') || ''), getDigest(expected),
  ]);
  const actual = new Uint8Array(actualDigest);
  const wanted = new Uint8Array(expectedDigest);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ wanted[i];
  return diff === 0;
}

async function readPayload(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_500_000) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, {stream: true});
  }
  try { return JSON.parse(body + decoder.decode()); } catch { return null; }
}

async function save(request, env, url, kind) {
  if (request.headers.get('Content-Type') !== 'application/json') return reply(415);
  const payload = await readPayload(request);
  const {key, lines} = payload ?? {};
  if (typeof key !== 'string' || !uuid.test(key) || !Array.isArray(lines) ||
      lines.length > 1000 || (kind === 'order' && !lines.length)) return reply(400);

  const catalogResponse = await env.ASSETS.fetch(new Request(new URL('/catalog.json', url)));
  const catalog = await catalogResponse.json();
  const products = new Map(catalog.items.map(product => [product.id, product]));
  const seen = new Set();
  const snapshot = [];
  for (const line of lines) {
    if (!Array.isArray(line)) return reply(400);
    const [id, qty, note = ''] = line;
    const product = products.get(id);
    if (!product || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > 999 ||
        typeof note !== 'string' || note.length > 500) return reply(400);
    seen.add(id);
    const {name, brand, price, photo, url: productUrl} = product;
    snapshot.push({id, name, brand, price, photo, url: productUrl, qty, note: note.trim()});
  }

  const now = new Date();
  const day = kind === 'cart' ? dayFormat.format(now) : '';
  const record = {key, created: now.toISOString(), rate: catalog.rate, date: catalog.date, lines: snapshot};
  if (kind === 'cart') record.day = day;
  const data = JSON.stringify(record);
  const db = env.SELECTIONS;
  if (kind === 'order') {
    await db.prepare('INSERT OR IGNORE INTO selection_records VALUES (?, ?, ?, ?)').bind(kind, key, day, data).run();
  } else if (snapshot.length) {
    await db.prepare('INSERT INTO selection_records VALUES (?, ?, ?, ?) ON CONFLICT(kind, cart_key, day) DO UPDATE SET snapshot = excluded.snapshot')
      .bind(kind, key, day, data).run();
  } else {
    await db.prepare('UPDATE selection_records SET snapshot = ? WHERE kind = ? AND cart_key = ? AND day = ?')
      .bind(data, kind, key, day).run();
  }
  return reply(200, {ok: true});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const kind = recordPaths.get(url.pathname);
    const adminPage = adminPages.has(url.pathname);
    try {
      if (url.pathname === '/api/gallery' && method === 'GET') {
        const asset = await env.ASSETS.fetch(new Request(new URL('/catalog.json', url)));
        const catalog = await asset.json();
        const product = catalog.items.find(item => item.id === url.searchParams.get('id'));
        return product ? reply(200, product.images?.length ? product.images : [product.photo]) : reply(404);
      }
      if (adminPage || (kind && method !== 'POST')) {
        if (!env.MINE_ADMIN_PASSWORD || !env.SELECTIONS) return reply(503);
        if (!await authenticate(request, env.MINE_ADMIN_PASSWORD)) {
          return new Response('Administrator sign-in required.', {
            status: 401, headers: {...privateHeaders, 'WWW-Authenticate': 'Basic realm="Meowfield admin", charset="UTF-8"'},
          });
        }
      }
      if (kind) {
        if (!env.MINE_ADMIN_PASSWORD || !env.SELECTIONS) return reply(503);
        if (method === 'GET') {
          const {results} = await env.SELECTIONS.prepare('SELECT snapshot FROM selection_records WHERE kind = ?')
            .bind(kind).all();
          return reply(200, results.map(row => JSON.parse(row.snapshot)));
        }
        if (!['POST', 'DELETE'].includes(method)) return reply(405);
        if (request.headers.get('Origin') !== url.origin) return reply(403);
        if (method === 'POST') return await save(request, env, url, kind);
        const key = url.searchParams.get('key') || '';
        const day = kind === 'cart' ? url.searchParams.get('day') || '' : '';
        if (!uuid.test(key) || (kind === 'cart' && !dayPattern.test(day))) return reply(400);
        await env.SELECTIONS.prepare('DELETE FROM selection_records WHERE kind = ? AND cart_key = ? AND day = ?')
          .bind(kind, key, day).run();
        return reply(200, {ok: true});
      }
      if (url.pathname.startsWith('/api/')) return reply(404);
      if (adminPage && url.pathname !== '/admin.html') {
        return Response.redirect(new URL('/admin.html', url), 302);
      }
      if (adminPage || ['/', '/index.html', '/cart', '/product'].includes(url.pathname)) {
        const asset = await env.ASSETS.fetch(new Request(new URL('/cloud-index', url), {method}));
        if (!adminPage) return asset;
        const response = new Response(asset.body, asset);
        for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
        return response;
      }
      return await env.ASSETS.fetch(request);
    } catch {
      return reply(500, {error: '请求未完成，请重试'});
    }
  },
};
