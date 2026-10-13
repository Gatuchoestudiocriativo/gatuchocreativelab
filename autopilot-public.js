const config = window.GATUCHO_CONFIG || {};

function configured() {
  return /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(config.supabaseUrl || '') &&
    /^(sb_publishable_|eyJ)/.test(config.supabasePublishableKey || '') &&
    !String(config.supabaseUrl).includes('SEU_PROJECT_ID') &&
    !String(config.supabasePublishableKey).includes('COLE_AQUI');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[ch]);
}

function setDynamicColor(slug, color, category) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
  let style = document.getElementById('gatuchoDynamicProductColors');
  if (!style) {
    style = document.createElement('style');
    style.id = 'gatuchoDynamicProductColors';
    document.head.appendChild(style);
  }
  const selector = category === 'agente' ? '.agente-card' : '.curso-card';
  style.textContent += `${selector}[data-product-slug="${CSS.escape(slug)}"]::before{background:${color}}\n`;
}

function renderCourse(product) {
  const card = document.createElement('a');
  card.href = product.checkout_url || product.public_url || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.className = 'curso-card dyn-curso';
  card.dataset.productSlug = product.slug;
  card.dataset.c = product.slug;
  const color = product.color || '#4ECDC4';
  setDynamicColor(product.slug, color, 'curso');
  const tags = (product.tags || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  card.innerHTML = `
    <div class="cc-bar" style="background:${color}"></div>
    <div class="cc-top">
      <span class="cc-badge" style="color:${color};border-color:${color}">${escapeHtml(product.badge || 'Curso')}</span>
      <span class="cc-num">${String(product.sort_order || 99).padStart(2, '0')}</span>
    </div>
    <div class="cc-emoji">${escapeHtml(product.emoji || '✦')}</div>
    <div>
      <h3 class="cc-title">${escapeHtml(product.title)}</h3>
      <p class="cc-desc">${escapeHtml(product.description || '')}</p>
      <div class="cc-footer"><div class="cc-tags">${tags}</div><div class="cc-arrow" style="border-color:${color};color:${color}">↗</div></div>
    </div>`;
  return card;
}

function renderAgent(product) {
  const card = document.createElement('a');
  card.href = product.checkout_url || product.public_url || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.className = 'agente-card dyn-agente';
  card.dataset.productSlug = product.slug;
  card.dataset.c = product.slug;
  const color = product.color || '#4ECDC4';
  setDynamicColor(product.slug, color, 'agente');
  card.innerHTML = `
    <div class="ag-icon" style="background:${color}18">
      <svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>
      </svg>
    </div>
    <div><div class="ag-name">${escapeHtml(product.title)}</div><div class="ag-desc">${escapeHtml(product.description || '')}</div></div>
    <span class="ag-badge" style="color:${color};border-color:${color}44">${escapeHtml(product.badge || 'IA')}</span>
    <span class="ag-arrow">→</span>`;
  return card;
}

function updateStaticCard(card, product) {
  const href = product.checkout_url || product.public_url;
  if (href) card.href = href;
  card.rel = 'noopener noreferrer';
  if (product.color) setDynamicColor(product.slug, product.color, product.category);

  if (product.category === 'curso') {
    const title = card.querySelector('.cc-title');
    const desc = card.querySelector('.cc-desc');
    const badge = card.querySelector('.cc-badge');
    const emoji = card.querySelector('.cc-emoji');
    const tags = card.querySelector('.cc-tags');
    const bar = card.querySelector('.cc-bar');
    const arrow = card.querySelector('.cc-arrow');
    if (title) title.textContent = product.title;
    if (desc) desc.textContent = product.description || '';
    if (badge) { badge.textContent = product.badge || 'Curso'; badge.style.color = product.color || ''; badge.style.borderColor = product.color || ''; }
    if (emoji && product.emoji) emoji.textContent = product.emoji;
    if (bar && product.color) bar.style.background = product.color;
    if (arrow && product.color) { arrow.style.color = product.color; arrow.style.borderColor = product.color; }
    if (tags && Array.isArray(product.tags)) tags.innerHTML = product.tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  } else {
    const title = card.querySelector('.ag-name');
    const desc = card.querySelector('.ag-desc');
    const badge = card.querySelector('.ag-badge');
    if (title) title.textContent = product.title;
    if (desc) desc.textContent = product.description || '';
    if (badge) { badge.textContent = product.badge || 'IA'; badge.style.color = product.color || ''; }
  }
}

async function loadCatalog() {
  if (!configured()) return;
  const url = new URL(`${config.supabaseUrl}/rest/v1/products`);
  url.searchParams.set('select', 'id,slug,title,description,category,color,emoji,badge,tags,checkout_url,public_url,sort_order');
  url.searchParams.set('active', 'eq.true');
  url.searchParams.set('published', 'eq.true');
  url.searchParams.set('order', 'sort_order.asc,title.asc');

  const response = await fetch(url, {
    headers: { apikey: config.supabasePublishableKey }
  });
  if (!response.ok) throw new Error(`Catálogo: ${response.status}`);
  const products = await response.json();
  if (!Array.isArray(products) || products.length === 0) return;

  const courseGrid = document.getElementById('cursosGrid');
  const agentGrid = document.getElementById('agentesGrid');

  document.querySelectorAll('.dyn-curso,.dyn-agente').forEach((el) => el.remove());
  products.forEach((product) => {
    const existing = document.querySelector(`[data-product-slug="${CSS.escape(product.slug)}"]`);
    if (existing) {
      updateStaticCard(existing, product);
      return;
    }
    if (product.category === 'curso' && courseGrid) courseGrid.appendChild(renderCourse(product));
    if (product.category === 'agente' && agentGrid) agentGrid.appendChild(renderAgent(product));
  });

  const count = document.querySelector('.products-section .sec-count');
  if (count) count.textContent = `${String(products.length).padStart(2, '0')} itens`;
}

function anonymousId() {
  const key = 'gatucho_anon_v1';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function utm() {
  const q = new URLSearchParams(location.search);
  return {
    source: q.get('utm_source') || null,
    medium: q.get('utm_medium') || null,
    campaign: q.get('utm_campaign') || null
  };
}

function referrerDomain() {
  if (!document.referrer) return null;
  try { return new URL(document.referrer).hostname.slice(0, 120); } catch { return null; }
}

async function track(eventType, productSlug = null) {
  if (!configured()) return;
  const payload = {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    anonymous_id: anonymousId(),
    product_slug: productSlug,
    path: `${location.pathname}${location.search}`.slice(0, 500),
    referrer_domain: referrerDomain(),
    ...utm(),
    occurred_at: new Date().toISOString()
  };
  try {
    await fetch(`${config.supabaseUrl}/functions/v1/track-event`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabasePublishableKey
      },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Analytics nunca deve impedir a navegação ou a compra.
  }
}

function bindTracking() {
  track('page_view');
  const article = document.querySelector('[data-article-slug]');
  if (article) track('article_view', article.dataset.productSlug || null);
  document.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product-slug]');
    if (card) track('product_click', card.dataset.productSlug || null);
    const hotmart = event.target.closest('a[href*="hotmart.com"],a[href*="go.hotmart.com"],a[href*="pay.hotmart.com"]');
    if (hotmart && !card) track('hotmart_click');
  }, { passive: true });
}

loadCatalog().catch((error) => console.warn('[Gatucho] catálogo persistente indisponível; usando fallback estático.', error));
bindTracking();
