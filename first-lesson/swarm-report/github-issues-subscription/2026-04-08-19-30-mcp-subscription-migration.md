# Миграция подписок на GitHub issues в MCP

**Дата:** 2026-04-08
**Статус:** Done

## Описание задачи

Перенос логики подписок на GitHub issues из backend (NestJS) в github-explorer-mcp. MCP становится единственным владельцем данных подписок, хранит их в своей таблице в PostgreSQL, запускает cron-поллер и отправляет callback в backend при обнаружении новых issues.

## Итоги Research

Консилиум из 3 агентов (Архитектор, Фронтенд-эксперт, UI-дизайнер):
- Текущая реализация: backend владеет подписками, poller в NestJS (@Cron), MCP только проверяет issues
- Frontend `subscribe` функция нигде не вызывается — мёртвый код
- Баг SSE: backend пушит `new_notification`, frontend слушает `new_issue` — уведомления не приходят
- Frontend API route mismatch: `/subscriptions?conversationId=` vs `/conversations/:id/subscriptions`

## План

4 фазы:
1. **MCP** — DB pool, таблица mcp_issue_subscriptions, tools (subscribe_to_issues, list_subscriptions), poller с callback
2. **Backend** — callback endpoint, переписка subscription service на MCP tools, удаление poller/repository
3. **DB Migration** — drop FK issue_notifications → issue_subscriptions, make subscription_id nullable
4. **Frontend** — fix SSE баг, удаление мёртвого кода, refresh подписок после pipeline

## Что реализовано

### Новые файлы (6):
- `github-explorer-mcp/src/db.ts` — PostgreSQL pool + CREATE TABLE IF NOT EXISTS
- `github-explorer-mcp/src/poller.ts` — setInterval 5 мин, deactivate expired, poll GitHub API, HTTP POST callback
- `github-explorer-mcp/src/tools/subscribe-to-issues.ts` — создание подписки с проверкой дубликатов
- `github-explorer-mcp/src/tools/list-subscriptions.ts` — список активных подписок по conversation_id
- `backend/src/subscription/subscription-callback.controller.ts` — POST /api/internal/subscription-callback с X-MCP-Secret авторизацией, AI summary генерация, notification push
- `backend/src/subscription/dto/subscription-callback.dto.ts` — DTO для callback payload

### Изменённые файлы (10):
- `github-explorer-mcp/package.json` — добавлена зависимость pg
- `github-explorer-mcp/src/index.ts` — зарегистрированы новые tools, initDb() + startPoller()
- `docker-compose.yml` — DATABASE_URL, BACKEND_CALLBACK_URL, MCP_CALLBACK_SECRET для MCP; MCP_CALLBACK_SECRET для backend; depends_on postgres для MCP
- `backend/src/subscription/subscription.service.ts` — переписан на McpToolRouter вместо SubscriptionRepository
- `backend/src/subscription/subscription.controller.ts` — удалён POST, добавлен @Query('conversationId')
- `backend/src/subscription/subscription.module.ts` — убраны poller/repository, добавлен callback controller
- `backend/src/subscription/interfaces/issue-subscription.interface.ts` — обновлён под MCP response shape
- `backend/src/database/migrations.service.ts` — миграция #17: drop FK, nullable subscription_id
- `frontend/src/hooks/use-notification-stream.ts` — fix: 'new_issue' → 'new_notification'
- `frontend/src/types/notification.ts` — fix: 'new_issue' → 'new_notification'
- `frontend/src/lib/api.ts` — удалён createSubscription, исправлен route getConversationSubscriptions
- `frontend/src/hooks/use-subscriptions.ts` — удалён subscribe
- `frontend/src/context/notification-context.tsx` — удалён subscribe из контекста
- `frontend/src/components/chat/chat-layout.tsx` — refresh подписок после pipeline completion

### Удалённые файлы (3):
- `backend/src/subscription/subscription-poller.service.ts`
- `backend/src/subscription/repositories/subscription.repository.ts`
- `backend/src/subscription/dto/create-subscription.dto.ts`

## Результаты Validation

- Backend: `tsc --noEmit` ✓
- Frontend: `tsc --noEmit` ✓
- MCP: `tsc --noEmit` ✓
- Интерфейсы callback payload согласованы
- Docker-compose: env vars, depends_on корректны
- Callback URL: /api/internal/subscription-callback (с global prefix /api)

## Исправленные баги (в рамках задачи)

1. **SSE type mismatch** — backend пушил `new_notification`, frontend слушал `new_issue`. Исправлено на `new_notification` в обоих местах.
2. **Frontend API route** — `getConversationSubscriptions` вызывал `/subscriptions?conversationId=X` вместо `/conversations/X/subscriptions`. Исправлено.
3. **Мёртвый код** — `createSubscription` в API, `subscribe` в хуке/контексте удалены.

## Новые env-переменные

| Переменная | Где | Назначение |
|---|---|---|
| `DATABASE_URL` | github-explorer-mcp | PostgreSQL connection для хранения подписок |
| `BACKEND_CALLBACK_URL` | github-explorer-mcp | URL callback endpoint бэкенда |
| `MCP_CALLBACK_SECRET` | github-explorer-mcp, backend | Shared secret для авторизации callback'ов |
