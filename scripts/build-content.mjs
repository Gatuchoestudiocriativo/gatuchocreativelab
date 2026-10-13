import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SITE = (process.env.PUBLIC_SITE_URL || 'https://gatuchoestudiocriativo.github.io/gatuchocreativelab').replace(/\/$/, '');

if (!SUPABASE_URL || !KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY nas Variables do repositório.');
  process.exit(1);
}

const esc = (s = '') => String(s).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function inline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
}

function markdown(md = '') {
  const lines = String(md).replace(/\r/g, '').split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^###\s+/.test(line)) { closeList(); html += `<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`; continue; }
    if (/^##\s+/.test(line)) { closeList(); html += `<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`; continue; }
    if (/^#\s+/.test(line)) { closeList(); html += `<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`; continue; }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function shell(title, description, canonical, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Gatucho</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><link rel="icon" type="image/svg+xml" href="../favicon.svg"><link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{margin:0;background:#0d0f0e;color:#d8ecea;font-family:'DM Sans',sans-serif}a{color:#4ECDC4}header{border-bottom:1px solid rgba(78,205,196,.14);padding:1.2rem max(1.2rem,calc((100vw - 900px)/2))}header a{text-decoration:none;font-family:'Syne',sans-serif;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.wrap{max-width:900px;margin:auto;padding:4rem 1.2rem 6rem}.eyebrow{font:700 .7rem 'Space Mono',monospace;color:#4ECDC4;text-transform:uppercase;letter-spacing:.1em}h1{font:800 clamp(2.4rem,6vw,5rem)/.98 'Syne',sans-serif;letter-spacing:-.05em;margin:.8rem 0 1.2rem}h2{font:800 1.8rem 'Syne',sans-serif;margin:2.4rem 0 .8rem}h3{font:700 1.2rem 'Syne',sans-serif;margin:1.8rem 0 .6rem}p,li{line-height:1.75;color:rgba(216,236,234,.82)}.lead{font-size:1.15rem;color:#d8ecea;border-left:2px solid #4ECDC4;padding-left:1rem}.article{margin-top:2.5rem}.article code{font-family:'Space Mono',monospace;background:#181c1b;padding:.12rem .3rem}.cta{margin-top:3rem;border:1px solid rgba(78,205,196,.22);padding:1.3rem;background:rgba(78,205,196,.06)}.cta-link{display:inline-block;margin-top:.65rem;padding:.8rem 1rem;border:1px solid #4ECDC4;text-decoration:none;font:700 .75rem 'Space Mono',monospace;text-transform:uppercase;letter-spacing:.04em}.cta-link:hover{background:#4ECDC4;color:#0d0f0e}footer{border-top:1px solid rgba(78,205,196,.12);padding:1.5rem;text-align:center;color:rgba(216,236,234,.55);font: .7rem 'Space Mono',monospace}</style></head><body><header><a href="${SITE}/">Gatucho Creative Lab</a></header>${body}<footer>Conteúdo educativo · compra e pagamento processados na Hotmart quando houver oferta associada.</footer><script src="../supabase-config.js"></script><script type="module" src="../autopilot-public.js"></script></body></html>`;
}

const endpoint = new URL(`${SUPABASE_URL}/rest/v1/content_assets`);
endpoint.searchParams.set('select', 'product_id,slug,title,excerpt,content_markdown,cta_text,keywords,published_at');
endpoint.searchParams.set('status', 'eq.publicado');
endpoint.searchParams.set('asset_type', 'eq.seo_article');
endpoint.searchParams.set('order', 'published_at.desc');
const res = await fetch(endpoint, { headers: { apikey: KEY } });
if (!res.ok) throw new Error(`Supabase respondeu ${res.status}: ${await res.text()}`);
const articles = await res.json();

const productEndpoint = new URL(`${SUPABASE_URL}/rest/v1/products`);
productEndpoint.searchParams.set('select', 'id,slug,title,checkout_url,public_url');
productEndpoint.searchParams.set('active', 'eq.true');
productEndpoint.searchParams.set('published', 'eq.true');
const productRes = await fetch(productEndpoint, { headers: { apikey: KEY } });
if (!productRes.ok) throw new Error(`Supabase (produtos) respondeu ${productRes.status}: ${await productRes.text()}`);
const products = await productRes.json();
const productById = new Map((products || []).map((product) => [product.id, product]));

const out = join(process.cwd(), 'conteudos');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const article of articles) {
  if (!article.slug) continue;
  const canonical = `${SITE}/conteudos/${encodeURIComponent(article.slug)}.html`;
  const product = productById.get(article.product_id) || null;
  const checkout = product?.checkout_url || product?.public_url || null;
  const cta = (article.cta_text || checkout) ? `<div class="cta">${article.cta_text ? `<p>${esc(article.cta_text)}</p>` : ''}${checkout ? `<a class="cta-link" data-product-slug="${esc(product.slug)}" href="${esc(checkout)}" target="_blank" rel="noopener noreferrer">Conhecer ${esc(product.title)} na Hotmart →</a>` : ''}</div>` : '';
  const body = `<main class="wrap" data-article-slug="${esc(article.slug)}"${product?.slug ? ` data-product-slug="${esc(product.slug)}"` : ''}><p class="eyebrow">/ conteúdo Gatucho</p><h1>${esc(article.title)}</h1><p class="lead">${esc(article.excerpt || '')}</p><article class="article">${markdown(article.content_markdown)}</article>${cta}</main>`;
  await writeFile(join(out, `${article.slug}.html`), shell(article.title, article.excerpt || article.title, canonical, body));
}

const cards = articles.map((a) => `<article><p class="eyebrow">/ ${a.published_at ? new Date(a.published_at).toLocaleDateString('pt-BR') : 'conteúdo'}</p><h2><a href="./${encodeURIComponent(a.slug)}.html">${esc(a.title)}</a></h2><p>${esc(a.excerpt || '')}</p></article>`).join('');
const indexBody = `<main class="wrap"><p class="eyebrow">/ arquivo</p><h1>Conteúdos</h1><p class="lead">Guias e materiais úteis produzidos no ecossistema Gatucho.</p><div class="article">${cards || '<p>Nenhum artigo publicado ainda.</p>'}</div></main>`;
await writeFile(join(out, 'index.html'), shell('Conteúdos', 'Conteúdos educativos do Gatucho Creative Lab.', `${SITE}/conteudos/`, indexBody));

const urls = [`${SITE}/`, `${SITE}/conteudos/`, ...articles.filter((a) => a.slug).map((a) => `${SITE}/conteudos/${encodeURIComponent(a.slug)}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${esc(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
await writeFile(join(process.cwd(), 'sitemap.xml'), sitemap);
console.log(`Geradas ${articles.length} página(s) de conteúdo e sitemap.xml.`);
