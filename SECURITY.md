# Segurança — Gatucho Autopilot

- Nenhum segredo deve ser commitado no repositório.
- `supabase-config.js` contém exclusivamente URL e Publishable Key.
- Todas as tabelas expostas têm RLS.
- Operações privilegiadas passam por Edge Functions ou sessão administrativa autorizada.
- Webhook Hotmart exige `X-HOTMART-HOTTOK` válido.
- PII de compradores não é persistida; identificadores necessários são pseudonimizados por SHA-256 + salt secreto.
- O painel administrativo não oferece cadastro público.
- Para revogar acesso, desative o registro correspondente em `public.admin_users` e revogue a sessão no Supabase Auth.
- Se um Secret vazar, rotacione-o imediatamente no provedor e no Supabase Edge Functions Secrets.
- O `admin.html` aplica uma Content Security Policy restritiva compatível com GitHub Pages.
- A sessão do painel é encerrada após 30 minutos de inatividade no navegador.
