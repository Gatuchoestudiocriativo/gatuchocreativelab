/*
  GATUCHO AUTOPILOT — CONFIGURAÇÃO PÚBLICA
  ----------------------------------------
  Este arquivo PODE ficar no GitHub Pages.
  A URL do projeto e a Publishable Key do Supabase são públicas por definição.

  NUNCA coloque aqui:
  - sb_secret_... / service_role
  - senha do banco
  - HOTMART_CLIENT_SECRET / HOTMART_BASIC / HOTMART_HOTTOK
  - GEMINI_API_KEY
  - CRON_SECRET
*/
window.GATUCHO_CONFIG = Object.freeze({
  supabaseUrl: 'https://SEU_PROJECT_ID.supabase.co',
  supabasePublishableKey: 'sb_publishable_COLE_AQUI',
  siteUrl: 'https://gatuchoestudiocriativo.github.io/gatuchocreativelab',
  publicOrigin: 'https://gatuchoestudiocriativo.github.io'
});
