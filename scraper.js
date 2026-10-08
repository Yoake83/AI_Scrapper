import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast';
  } catch { return false; }
}
export function validateUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new AppError('Enter a complete URL beginning with https:// or http://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    throw new AppError('Use a public HTTP or HTTPS URL without credentials or custom ports.');
  }
  return url;
}

async function requestPage(url, signal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new AppError('Only public websites can be scraped. Private and local addresses are blocked.');
  }
  // Pin the validated address for this connection to prevent DNS rebinding.
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [selected]) : callback(null, selected.address, selected.family),
      headers: { 'User-Agent': 'CherryPicked/1.0 (HTML summary tool)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        resolve({ redirect: response.headers.location });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(new AppError(`The website returned HTTP ${response.statusCode}. Try another page.`, 422)); return;
      }
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) {
        response.resume(); reject(new AppError('This URL does not return an HTML webpage.', 422)); return;
      }
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) { response.destroy(new AppError('This page is too large. Try a smaller article.', 422)); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

export function extractContent(html) {
  const $ = load(html);
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || 'Untitled page';
  $('script, style, noscript, svg, nav, footer, header, aside, form, [hidden]').remove();
  const root = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body');
  root.find('br').replaceWith('\n');
  root.find('p, h1, h2, h3, h4, li, div, section').each((_, element) => $(element).append('\n'));
  const text = root.text().replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  if (text.length < 80) throw new AppError('Not enough readable text was found. Try a public article with basic HTML content.', 422);
  return { title: title.slice(0, 300), text: text.slice(0, 12000), truncated: text.length > 12000 };
}

export async function scrape(input) {
  let url = validateUrl(input);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    signal.throwIfAborted();
    const result = await requestPage(url, signal);
    if ('redirect' in result) {
      if (!result.redirect) throw new AppError('The website returned an invalid redirect.', 422);
      url = validateUrl(new URL(result.redirect, url).href);
      continue;
    }
    return { ...extractContent(result.html), url: url.href };
  }
  throw new AppError('This website redirected too many times.', 422);
}
