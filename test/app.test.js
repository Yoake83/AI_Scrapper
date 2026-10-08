import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, summarizeWithGroq } from '../app.js';
import { extractContent, isPublicAddress, scrape, validateUrl } from '../scraper.js';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (base, url) => fetch(`${base}/api/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });

test('extracts article content and removes navigation, scripts and footer', () => {
  const page = extractContent('<html><head><title>Peach harvest</title></head><body><nav>NO NAV</nav><article><h1>Fresh peaches</h1><p>Peaches are harvested in summer. Ripe fruit has a sweet aroma and gives slightly when gently pressed.</p><script>NO SCRIPT</script></article><footer>NO FOOTER</footer></body></html>');
  assert.equal(page.title, 'Peach harvest');
  assert.match(page.text, /Ripe fruit/);
  assert.doesNotMatch(page.text, /NO NAV|NO SCRIPT|NO FOOTER/);
});
test('rejects insufficient content and reports truncated articles', () => {
  assert.throws(() => extractContent('<body>Empty</body>'), /Not enough/);
  const page = extractContent(`<body><main>${'fruit '.repeat(6000)}</main></body>`);
  assert.equal(page.text.length, 24000);
  assert.equal(page.truncated, true);
});
test('URL validation rejects dangerous schemes, credentials and custom ports', () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pass@example.com', 'http://example.com:8080', 'not a url']) assert.throws(() => validateUrl(url));
  assert.equal(validateUrl('https://example.com/article').hostname, 'example.com');
});
test('blocks loopback, private, link-local, mapped IPv6 and metadata addresses', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '0.0.0.0']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  await assert.rejects(scrape('http://127.0.0.1'), /Only public websites/);
});
test('API returns the extracted source and generated summary; frontend is served', async () => {
  let received;
  const app = createApp({ hasKey: () => true, scrapePage: async url => ({ url, title: 'Article', text: 'Some useful source text.', truncated: false }), summarize: async (text, title) => { received = { text, title }; return 'A concise summary.\n- Key idea'; } });
  await withServer(app, async base => {
    const response = await post(base, 'https://example.com');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary, 'A concise summary.\n- Key idea');
    assert.equal(data.wordCount, 4);
    assert.deepEqual(received, { text: 'Some useful source text.', title: 'Article' });
    const frontend = await fetch(base);
    assert.match(await frontend.text(), /Cherry Picked/);
    assert.match(frontend.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  });
});
test('missing API key and invalid URL return actionable errors', async () => {
  await withServer(createApp({ hasKey: () => false }), async base => {
    const response = await post(base, 'https://example.com');
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /GROQ_API_KEY/);
    assert.equal((await post(base, 'file:///etc/passwd')).status, 400);
  });
});
test('API enforces request rate limit', async () => {
  await withServer(createApp({ hasKey: () => false }), async base => {
    for (let i = 0; i < 10; i++) assert.equal((await post(base, 'https://example.com')).status, 503);
    assert.equal((await post(base, 'https://example.com')).status, 429);
  });
});
test('Groq integration sends source as data and handles response and rate limits', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.model, process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
      assert.equal(JSON.parse(body.messages[1].content).webpageText, 'Source text');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Short summary' } }] }), { status: 200 });
    };
    assert.equal(await summarizeWithGroq('Source text', 'Title'), 'Short summary');
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(summarizeWithGroq('Source text', 'Title'), /free-tier limit/);
  } finally { globalThis.fetch = original; }
});
