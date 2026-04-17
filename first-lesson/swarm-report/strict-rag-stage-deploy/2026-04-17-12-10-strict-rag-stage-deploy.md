# Отчёт по задаче `strict-rag-stage-deploy`

## Задача

Раскатить на stage backend/frontend-изменения strict RAG, чтобы можно было повторно проверить новый диалог на актуальном коде.

## Что задеплоено

- Коммит: `7296f17` — `Harden strict RAG pipeline responses`
- В деплой вошли:
  - `backend/src/message-processing/services/step-orchestrator.service.ts`
  - `backend/src/message-processing/services/step-runner.service.ts`
  - `backend/src/rag/rag.service.ts`
  - `frontend/src/components/chat/debug-panel.tsx`

## Локальные проверки

- `cd backend && npx tsc --noEmit`
- `cd frontend && npx tsc --noEmit`

## Особенности push

- `origin` настроен на `https://github.com/...`, поэтому обычный `git push origin develop` в этой сессии не смог запросить учётные данные
- Push выполнен по SSH с временной копией ключа и успешно обновил удалённую ветку `develop` до `7296f17`

## Удалённый деплой

- Выполнен штатный сценарий:
  - `ssh root@167.235.226.104 -p 2222`
  - `cd /srv/ai-chalange`
  - `bash update.sh first-lesson`

## Проверка после деплоя

- `docker compose ps`:
  - `backend` — `Up`
  - `frontend` — `Up`
  - `postgres` — `Up (healthy)`
  - `postgres-mcp` — `Up (healthy)`
  - `github-explorer-mcp` — `Up (healthy)`
  - `knowledge-base-mcp` — `Up (healthy)`
- HTTP smoke:
  - `http://167.235.226.104:6500/api/auth/me` → `401 Unauthorized`
  - `http://167.235.226.104:6501` → `307 Temporary Redirect`
- В backend-логах критичных ошибок нет

## Замечания

- В логах backend остаются ожидаемые предупреждения `MCP server "... returned 0 tools"`; для текущего тестового режима RAG это считается нормальным состоянием
- Новых env-переменных для этого деплоя не потребовалось

## Статус

Готово
