-- GATUCHO AUTOPILOT — AGENDAMENTOS
-- Execute SOMENTE depois de:
-- 1) deploy das Edge Functions;
-- 2) definir CRON_SECRET nos Secrets do projeto;
-- 3) trocar os dois valores COLE_AQUI abaixo.
-- O AUTOPILOT permanece inativo até ser ligado no admin.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Crie estes segredos uma única vez no Vault.
select vault.create_secret('https://SEU_PROJECT_ID.supabase.co', 'gatucho_project_url');
select vault.create_secret('COLE_AQUI_O_MESMO_CRON_SECRET', 'gatucho_cron_secret');

-- Se precisar recriar os jobs, descomente estas linhas primeiro:
-- select cron.unschedule('gatucho-analista-diario');
-- select cron.unschedule('gatucho-radar-semanal');
-- select cron.unschedule('gatucho-conteudo-semanal');
-- select cron.unschedule('gatucho-otimizador-semanal');

-- 08:10 de Brasília = 11:10 UTC (fora do horário de verão, atualmente não adotado no Brasil).
select cron.schedule(
  'gatucho-analista-diario',
  '10 11 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_project_url') || '/functions/v1/agent-runner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-gatucho-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_cron_secret')
    ),
    body := '{"agent_key":"analista"}'::jsonb
  );
  $$
);

-- Segunda-feira, 08:20 de Brasília.
select cron.schedule(
  'gatucho-radar-semanal',
  '20 11 * * 1',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_project_url') || '/functions/v1/agent-runner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-gatucho-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_cron_secret')
    ),
    body := '{"agent_key":"radar"}'::jsonb
  );
  $$
);

-- Quarta-feira, 08:30 de Brasília.
select cron.schedule(
  'gatucho-conteudo-semanal',
  '30 11 * * 3',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_project_url') || '/functions/v1/agent-runner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-gatucho-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_cron_secret')
    ),
    body := '{"agent_key":"conteudo"}'::jsonb
  );
  $$
);

-- Sexta-feira, 08:40 de Brasília.
select cron.schedule(
  'gatucho-otimizador-semanal',
  '40 11 * * 5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_project_url') || '/functions/v1/agent-runner',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-gatucho-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gatucho_cron_secret')
    ),
    body := '{"agent_key":"otimizador"}'::jsonb
  );
  $$
);
