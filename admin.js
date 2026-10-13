import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

const config = window.GATUCHO_CONFIG || {};
const isConfigured = /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(config.supabaseUrl || '')
  && /^(sb_publishable_|eyJ)/.test(config.supabasePublishableKey || '')
  && !String(config.supabaseUrl).includes('SEU_PROJECT_ID')
  && !String(config.supabasePublishableKey).includes('COLE_AQUI');

const supabase = isConfigured
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
let idleTimer = null;

const state = {
  products: [],
  agents: [],
  runs: [],
  content: [],
  webEvents: [],
  commerceEvents: [],
  settings: new Map(),
  health: null,
  contentFilter: 'all',
  selectedProductId: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[ch]);
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function fmtMoney(value, currency = 'BRL') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(number); }
  catch { return `${number.toFixed(2)} ${currency || ''}`.trim(); }
}

function slugify(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3600);
}

function setBusy(button, busy, label = 'Aguarde…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function showLogin() {
  $('#loginShell').hidden = false;
  $('#appShell').hidden = true;
}

function showApp() {
  $('#loginShell').hidden = true;
  $('#appShell').hidden = false;
}

function resetIdleTimer() {
  if (!supabase) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;
    await supabase.auth.signOut();
    showLogin();
    $('#loginError').textContent = 'Sessão encerrada após 30 minutos de inatividade.';
  }, IDLE_TIMEOUT_MS);
}

async function verifyAdmin(session) {
  if (!session?.user) return false;
  const { data, error } = await supabase.from('admin_users').select('user_id,active')
    .eq('user_id', session.user.id).eq('active', true).maybeSingle();
  return !error && Boolean(data?.active);
}

async function enterApp(session) {
  const allowed = await verifyAdmin(session);
  if (!allowed) {
    await supabase.auth.signOut();
    $('#loginError').textContent = 'Esta conta não tem autorização administrativa.';
    showLogin();
    return;
  }
  showApp();
  resetIdleTimer();
  await refreshEverything();
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabase) return;
  const button = $('#loginButton');
  $('#loginError').textContent = '';
  setBusy(button, true, 'Entrando…');
  try {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await enterApp(data.session);
    $('#loginPassword').value = '';
  } catch (_) {
    $('#loginError').textContent = 'Não foi possível entrar. Confira as credenciais e a autorização do usuário.';
  } finally {
    setBusy(button, false);
  }
}

async function refreshEverything() {
  await Promise.all([loadProducts(), loadAgents(), loadSettings(), loadRuns(), loadContent(), loadMetrics(), loadHealth()]);
  renderOverview();
  renderAgents();
  renderProducts();
  renderContent();
  renderRuns();
}

async function loadProducts() {
  const { data, error } = await supabase.from('products').select('*').order('sort_order').order('title');
  if (error) throw error;
  state.products = data || [];
}

async function loadAgents() {
  const { data, error } = await supabase.from('agent_definitions').select('*').order('created_at');
  if (error) throw error;
  state.agents = data || [];
}

async function loadSettings() {
  const { data, error } = await supabase.from('app_settings').select('*');
  if (error) throw error;
  state.settings = new Map((data || []).map((row) => [row.key, row.value]));
}

async function loadRuns() {
  const { data, error } = await supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(100);
  if (error) throw error;
  state.runs = data || [];
}

async function loadContent() {
  const { data, error } = await supabase.from('content_assets').select('*').order('created_at', { ascending: false }).limit(150);
  if (error) throw error;
  state.content = data || [];
}

async function loadMetrics() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [web, commerce] = await Promise.all([
    supabase.from('web_events').select('event_type,occurred_at,product_id,product_slug').gte('occurred_at', since).limit(5000),
    supabase.from('commerce_events').select('event_name,purchase_status,amount,currency,occurred_at,product_id').gte('occurred_at', since).limit(5000)
  ]);
  if (web.error) throw web.error;
  if (commerce.error) throw commerce.error;
  state.webEvents = web.data || [];
  state.commerceEvents = commerce.data || [];
}

async function loadHealth() {
  try {
    const { data, error } = await supabase.functions.invoke('system-health', { body: {} });
    if (error) throw error;
    state.health = data;
  } catch (error) {
    state.health = { ok: false, services: { database: false, hotmart: false, gemini: false, cron: false, analytics_salt: false }, error: String(error?.message || error) };
  }
  renderHealth();
}

function renderOverview() {
  const views = state.webEvents.filter((e) => e.event_type === 'page_view').length;
  const clicks = state.webEvents.filter((e) => e.event_type === 'product_click').length;
  const sales = state.commerceEvents.filter((e) => e.event_name === 'PURCHASE_APPROVED' || e.purchase_status === 'APPROVED');
  const currencyGroups = sales.reduce((acc, event) => {
    const currency = event.currency || 'BRL';
    acc[currency] = (acc[currency] || 0) + (Number(event.amount) || 0);
    return acc;
  }, {});
  const currencies = Object.keys(currencyGroups);
  $('#metricViews').textContent = views.toLocaleString('pt-BR');
  $('#metricClicks').textContent = clicks.toLocaleString('pt-BR');
  $('#metricSales').textContent = sales.length.toLocaleString('pt-BR');
  if (currencies.length === 1) {
    $('#metricRevenue').textContent = fmtMoney(currencyGroups[currencies[0]], currencies[0]);
    $('#metricCurrency').textContent = currencies[0];
  } else if (currencies.length > 1) {
    $('#metricRevenue').textContent = `${currencies.length} moedas`;
    $('#metricCurrency').textContent = 'não somadas entre moedas';
  } else {
    $('#metricRevenue').textContent = fmtMoney(0, 'BRL');
    $('#metricCurrency').textContent = 'aguardando eventos';
  }

  const enabled = state.settings.get('autopilot_enabled') === true;
  $('#autopilotToggle').checked = enabled;
  $('#autopilotText').textContent = enabled ? 'ligado' : 'desligado';

  const recent = state.runs.slice(0, 5);
  $('#recentActivity').innerHTML = recent.length ? recent.map((run) => `
    <div class="activity-item"><div><strong>${escapeHtml(run.agent_key.toUpperCase())}</strong><span>${escapeHtml(run.output_summary || run.input_summary || 'Execução registrada')}</span></div><small>${fmtDate(run.started_at)}</small></div>`).join('')
    : '<p class="muted">Nenhuma execução ainda.</p>';
}

function renderHealth() {
  const services = state.health?.services || {};
  const items = [
    ['Banco + Auth', services.database, 'Supabase'],
    ['Hotmart', services.hotmart, services.hotmart ? 'credenciais + Hottok' : 'Secrets pendentes'],
    ['Gemini', services.gemini, services.gemini ? 'backend configurado' : 'API key pendente'],
    ['Cron', services.cron, services.cron ? 'segredo configurado' : 'agendamento pendente']
  ];
  $('#healthList').innerHTML = items.map(([label, ok, note]) => `
    <div class="health-item"><div><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></div><span class="health-status ${ok ? '' : 'bad'}">${ok ? 'OK' : 'PENDENTE'}</span></div>`).join('');

  setIntegrationStatus('#supabaseStatus', services.database, services.database ? 'Conectado e protegido por RLS' : 'Não foi possível confirmar o banco');
  setIntegrationStatus('#hotmartStatus', services.hotmart, services.hotmart ? 'Credenciais e Hottok presentes' : 'Configure os Secrets da Hotmart');
  setIntegrationStatus('#geminiStatus', services.gemini, services.gemini ? 'Agentes podem gerar conteúdo' : 'Configure GEMINI_API_KEY');
  setIntegrationStatus('#cronStatus', services.cron, services.cron ? 'Pronto para agendamentos' : 'Configure CRON_SECRET + Vault');
}

function setIntegrationStatus(selector, ok, text) {
  const el = $(selector);
  if (!el) return;
  el.textContent = `${ok ? '●' : '○'} ${text}`;
  el.className = `integration-status ${ok ? 'ok' : 'bad'}`;
}

function lastRunFor(agentKey) {
  return state.runs.find((run) => run.agent_key === agentKey);
}

function renderAgents() {
  const grid = $('#agentsGrid');
  if (!state.agents.length) {
    grid.innerHTML = '<div class="empty-state">Nenhum agente configurado.</div>';
    return;
  }
  grid.innerHTML = state.agents.map((agent) => {
    const run = lastRunFor(agent.agent_key);
    return `<article class="agent-card" data-agent-id="${escapeHtml(agent.id)}">
      <div class="agent-card-top"><div><span class="agent-stage">${escapeHtml(agent.stage)}</span><h3>${escapeHtml(agent.name)}</h3></div><label class="agent-enable"><input type="checkbox" data-agent-enable="${escapeHtml(agent.id)}" ${agent.enabled ? 'checked' : ''}> ativo</label></div>
      <p>${escapeHtml(agent.purpose)}</p>
      <div class="agent-controls">
        <label>Autonomia<select data-agent-autonomy="${escapeHtml(agent.id)}"><option value="rascunho" ${agent.autonomy === 'rascunho' ? 'selected' : ''}>Só rascunhar</option><option value="aprovar" ${agent.autonomy === 'aprovar' ? 'selected' : ''}>Exigir aprovação</option><option value="automatico" ${agent.autonomy === 'automatico' ? 'selected' : ''}>Automático</option></select></label>
        <button class="primary-button small" data-run-agent="${escapeHtml(agent.agent_key)}">Executar</button>
      </div>
      <div class="agent-last">${run ? `${escapeHtml(run.status)} · ${fmtDate(run.started_at)} · ${escapeHtml((run.output_summary || run.error_message || '').slice(0, 180))}` : 'Ainda não executado.'}</div>
    </article>`;
  }).join('');
}

async function updateAgent(id, patch) {
  const { error } = await supabase.from('agent_definitions').update(patch).eq('id', id);
  if (error) throw error;
  const agent = state.agents.find((item) => item.id === id);
  if (agent) Object.assign(agent, patch);
  toast('Configuração do agente salva.');
}

async function runAgent(agentKey, button = null) {
  const product = state.products.find((p) => p.slug === (state.settings.get('default_product_slug') || 'pais-conectados-filhos-saudaveis')) || state.products[0];
  if (!product) return toast('Cadastre um produto antes de executar agentes.', true);
  setBusy(button, true, 'Executando…');
  try {
    const { data, error } = await supabase.functions.invoke('agent-runner', { body: { agent_key: agentKey, product_id: product.id } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.skipped) toast(data.reason || 'Execução ignorada.');
    else toast(`${agentKey.toUpperCase()} concluiu e gravou o resultado.`);
    await Promise.all([loadRuns(), loadContent(), loadMetrics()]);
    renderOverview(); renderAgents(); renderContent(); renderRuns();
  } catch (error) {
    toast(`Falha ao executar ${agentKey}: ${error?.message || 'erro desconhecido'}`, true);
  } finally {
    setBusy(button, false);
  }
}

function renderProducts() {
  const list = $('#productList');
  if (!state.products.length) {
    list.innerHTML = '<div class="empty-state">Nenhum produto no catálogo.</div>';
    return;
  }
  list.innerHTML = state.products.map((product) => `
    <button class="product-row ${state.selectedProductId === product.id ? 'active' : ''}" data-product-id="${escapeHtml(product.id)}">
      <span class="product-color" style="background:${escapeHtml(product.color || '#4ECDC4')}"></span>
      <span class="product-meta"><strong>${escapeHtml(product.title)}</strong><small>${escapeHtml(product.category)} · ${product.hotmart_owned ? 'Hotmart própria' : 'link externo/fallback'}</small></span>
      <span class="product-state">${product.published && product.active ? 'publicado' : product.active ? 'oculto' : 'arquivado'}</span>
    </button>`).join('');
}

function clearProductForm() {
  state.selectedProductId = null;
  $('#productId').value = '';
  $('#productTitle').value = '';
  $('#productSlug').value = '';
  $('#productCategory').value = 'curso';
  $('#productDescription').value = '';
  $('#productColor').value = '#4ECDC4';
  $('#productEmoji').value = '';
  $('#productBadge').value = '';
  $('#productOrder').value = 100;
  $('#productTags').value = '';
  $('#productPublicUrl').value = '';
  $('#productCheckoutUrl').value = '';
  $('#productUcode').value = '';
  $('#productOfferCode').value = '';
  $('#productOwned').checked = false;
  $('#productPublished').checked = true;
  $('#productActive').checked = true;
  $('#deleteProductButton').hidden = true;
  $('#productFormTitle').textContent = 'Novo produto';
  $('#productFormMessage').textContent = '';
  renderProducts();
}

function selectProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  state.selectedProductId = id;
  $('#productId').value = product.id;
  $('#productTitle').value = product.title || '';
  $('#productSlug').value = product.slug || '';
  $('#productCategory').value = product.category || 'outro';
  $('#productDescription').value = product.description || '';
  $('#productColor').value = product.color || '#4ECDC4';
  $('#productEmoji').value = product.emoji || '';
  $('#productBadge').value = product.badge || '';
  $('#productOrder').value = product.sort_order ?? 100;
  $('#productTags').value = (product.tags || []).join(', ');
  $('#productPublicUrl').value = product.public_url || '';
  $('#productCheckoutUrl').value = product.checkout_url || '';
  $('#productUcode').value = product.hotmart_product_ucode || '';
  $('#productOfferCode').value = product.hotmart_offer_code || '';
  $('#productOwned').checked = Boolean(product.hotmart_owned);
  $('#productPublished').checked = Boolean(product.published);
  $('#productActive').checked = Boolean(product.active);
  $('#deleteProductButton').hidden = false;
  $('#productFormTitle').textContent = 'Editar produto';
  $('#productFormMessage').textContent = '';
  renderProducts();
}

async function saveProduct(event) {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, 'Salvando…');
  const id = $('#productId').value || null;
  const title = $('#productTitle').value.trim();
  const slug = ($('#productSlug').value.trim() || slugify(title));
  const payload = {
    title,
    slug,
    category: $('#productCategory').value,
    description: $('#productDescription').value.trim(),
    color: $('#productColor').value,
    emoji: $('#productEmoji').value.trim() || null,
    badge: $('#productBadge').value.trim() || null,
    sort_order: Number($('#productOrder').value) || 100,
    tags: $('#productTags').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
    public_url: $('#productPublicUrl').value.trim() || null,
    checkout_url: $('#productCheckoutUrl').value.trim() || null,
    hotmart_product_ucode: $('#productUcode').value.trim() || null,
    hotmart_offer_code: $('#productOfferCode').value.trim() || null,
    hotmart_owned: $('#productOwned').checked,
    published: $('#productPublished').checked,
    active: $('#productActive').checked
  };
  try {
    if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Informe título e um slug válido.');
    let result;
    if (id) result = await supabase.from('products').update(payload).eq('id', id).select().single();
    else result = await supabase.from('products').insert(payload).select().single();
    if (result.error) throw result.error;
    $('#productFormMessage').textContent = '✓ Persistido no Supabase.';
    toast('Produto salvo. O site público passará a ler esta versão.');
    await loadProducts();
    selectProduct(result.data.id);
  } catch (error) {
    $('#productFormMessage').textContent = `Erro: ${error?.message || error}`;
    toast('Não foi possível salvar o produto.', true);
  } finally {
    setBusy(button, false);
  }
}

async function archiveProduct() {
  const id = $('#productId').value;
  if (!id || !confirm('Arquivar este produto? Ele deixará de aparecer no site público.')) return;
  const { error } = await supabase.from('products').update({ active: false, published: false }).eq('id', id);
  if (error) return toast('Falha ao arquivar.', true);
  toast('Produto arquivado sem apagar histórico.');
  await loadProducts();
  clearProductForm();
}

async function syncHotmart() {
  const button = $('#syncHotmartButton');
  setBusy(button, true, 'Sincronizando…');
  try {
    const { data, error } = await supabase.functions.invoke('hotmart-sync', { body: {} });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const failures = data?.failures?.length || 0;
    toast(failures ? `Sincronização parcial: ${data.updated?.length || 0} atualizados, ${failures} falhas.` : `Hotmart sincronizada: ${data.updated?.length || 0} produto(s).`, Boolean(failures));
    await loadProducts();
    renderProducts();
    if (state.selectedProductId) selectProduct(state.selectedProductId);
  } catch (error) {
    toast(`Hotmart: ${error?.message || 'falha na integração'}`, true);
  } finally {
    setBusy(button, false);
  }
}

function renderContent() {
  const list = $('#contentList');
  const items = state.content.filter((asset) => state.contentFilter === 'all' || asset.status === state.contentFilter);
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Ainda não há materiais nesta categoria. Execute um agente para gerar o primeiro.</div>';
    return;
  }
  list.innerHTML = items.map((asset) => `
    <article class="content-item" data-content-id="${escapeHtml(asset.id)}">
      <div><p class="eyebrow">/ ${escapeHtml(asset.asset_type)}</p><h3>${escapeHtml(asset.title)}</h3><p>${escapeHtml(asset.excerpt || 'Sem resumo.')}</p><div class="content-meta"><span class="chip ${asset.status === 'publicado' ? 'published' : ''}">${escapeHtml(asset.status)}</span><span class="chip">${escapeHtml(asset.agent_key || 'manual')}</span><span class="chip">${fmtDate(asset.created_at)}</span></div></div>
      <div class="content-actions"><button class="ghost-button small" data-content-preview="${escapeHtml(asset.id)}">Ler</button>${asset.status === 'rascunho' ? `<button class="ghost-button small" data-content-status="aprovado" data-content-id="${escapeHtml(asset.id)}">Aprovar</button>` : ''}${asset.status !== 'publicado' && asset.asset_type === 'seo_article' ? `<button class="primary-button small" data-content-status="publicado" data-content-id="${escapeHtml(asset.id)}">Publicar</button>` : ''}${asset.status !== 'arquivado' ? `<button class="danger-button small" data-content-status="arquivado" data-content-id="${escapeHtml(asset.id)}">Arquivar</button>` : ''}</div>
    </article>`).join('');
}

function previewContent(id) {
  const asset = state.content.find((item) => item.id === id);
  if (!asset) return;
  $('#dialogType').textContent = `/ ${asset.asset_type} · ${asset.status}`;
  $('#dialogTitle').textContent = asset.title;
  $('#dialogExcerpt').textContent = asset.excerpt || '';
  $('#dialogContent').textContent = asset.content_markdown || '';
  $('#contentDialog').showModal();
}

async function changeContentStatus(id, status) {
  const patch = { status };
  if (status === 'publicado') patch.published_at = new Date().toISOString();
  if (status !== 'publicado') patch.published_at = null;
  const { error } = await supabase.from('content_assets').update(patch).eq('id', id);
  if (error) return toast('Não foi possível atualizar o conteúdo.', true);
  toast(status === 'publicado' ? 'Conteúdo publicado no banco. A rotina do GitHub materializa a página estática.' : `Conteúdo marcado como ${status}.`);
  await loadContent();
  renderContent();
}

function renderRuns() {
  const tbody = $('#runsBody');
  tbody.innerHTML = state.runs.length ? state.runs.map((run) => `<tr><td>${fmtDate(run.started_at)}</td><td>${escapeHtml(run.agent_key.toUpperCase())}</td><td><span class="run-status ${escapeHtml(run.status)}">${escapeHtml(run.status)}</span></td><td>${escapeHtml(run.trigger_source)}</td><td>${escapeHtml((run.output_summary || run.error_message || run.input_summary || '').slice(0, 260))}</td></tr>`).join('') : '<tr><td colspan="5">Nenhuma execução registrada.</td></tr>';
}

async function setAutopilot(enabled) {
  const { error } = await supabase.from('app_settings').upsert({ key: 'autopilot_enabled', value: enabled, description: 'Chave geral do Gatucho Autopilot.' });
  if (error) {
    $('#autopilotToggle').checked = !enabled;
    return toast('Não foi possível alterar o Autopilot.', true);
  }
  state.settings.set('autopilot_enabled', enabled);
  $('#autopilotText').textContent = enabled ? 'ligado' : 'desligado';
  toast(enabled ? 'Autopilot ligado. Os crons configurados poderão executar agentes.' : 'Autopilot desligado. Os crons serão ignorados.');
}

function switchView(name) {
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  const titles = {
    overview: ['/ controle', 'Visão geral'], agents: ['/ equipe autônoma', 'Agentes'], products: ['/ catálogo', 'Produtos'],
    content: ['/ fila editorial', 'Conteúdo'], runs: ['/ observabilidade', 'Execuções'], security: ['/ segurança', 'Integrações']
  };
  $('#viewEyebrow').textContent = titles[name]?.[0] || '/ controle';
  $('#viewTitle').textContent = titles[name]?.[1] || 'Gatucho Autopilot';
  $('#sidebar').classList.remove('open');
  history.replaceState(null, '', `#${name}`);
}

function bindEvents() {
  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, resetIdleTimer, { passive: true }));
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#logoutButton').addEventListener('click', async () => { clearTimeout(idleTimer); await supabase.auth.signOut(); showLogin(); });
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-view-link]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewLink)));
  $('#autopilotToggle').addEventListener('change', (event) => setAutopilot(event.target.checked));
  $('#refreshHealth').addEventListener('click', loadHealth);
  $('#syncHotmartButton').addEventListener('click', syncHotmart);
  $('#newProductButton').addEventListener('click', clearProductForm);
  $('#productForm').addEventListener('submit', saveProduct);
  $('#deleteProductButton').addEventListener('click', archiveProduct);
  $('#productTitle').addEventListener('input', () => { if (!$('#productId').value) $('#productSlug').value = slugify($('#productTitle').value); });
  $('#dialogClose').addEventListener('click', () => $('#contentDialog').close());

  document.addEventListener('click', (event) => {
    const runButton = event.target.closest('[data-run-agent]');
    if (runButton) return runAgent(runButton.dataset.runAgent, runButton);
    const productButton = event.target.closest('[data-product-id]');
    if (productButton) return selectProduct(productButton.dataset.productId);
    const preview = event.target.closest('[data-content-preview]');
    if (preview) return previewContent(preview.dataset.contentPreview);
    const statusButton = event.target.closest('[data-content-status]');
    if (statusButton) return changeContentStatus(statusButton.dataset.contentId, statusButton.dataset.contentStatus);
  });

  document.addEventListener('change', (event) => {
    const enable = event.target.closest('[data-agent-enable]');
    if (enable) return updateAgent(enable.dataset.agentEnable, { enabled: enable.checked }).catch(() => toast('Falha ao salvar agente.', true));
    const autonomy = event.target.closest('[data-agent-autonomy]');
    if (autonomy) return updateAgent(autonomy.dataset.agentAutonomy, { autonomy: autonomy.value }).catch(() => toast('Falha ao salvar autonomia.', true));
  });

  $('#contentFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    state.contentFilter = button.dataset.filter;
    $$('#contentFilters .filter').forEach((item) => item.classList.toggle('active', item === button));
    renderContent();
  });
}

async function init() {
  bindEvents();
  if (!isConfigured) {
    $('#configWarning').hidden = false;
    $('#loginButton').disabled = true;
    $('#loginError').textContent = 'Conecte o projeto Supabase em supabase-config.js para ativar o admin.';
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await enterApp(session); else showLogin();

  supabase.auth.onAuthStateChange(async (event, sessionNow) => {
    if (event === 'SIGNED_OUT') showLogin();
    if (event === 'SIGNED_IN' && sessionNow && $('#appShell').hidden) await enterApp(sessionNow);
  });

  const initialView = location.hash.replace('#', '');
  if (['overview', 'agents', 'products', 'content', 'runs', 'security'].includes(initialView)) switchView(initialView);
}

init().catch((error) => {
  console.error(error);
  toast('Falha ao inicializar o painel.', true);
  showLogin();
});
