# Research: Перенос подписок из backend в github-explorer-mcp

## Дата: 2026-04-08

## Консилиум

### Архитектор
- Полная карта зависимостей: frontend -> backend REST -> subscription module -> MCP (check_new_issues) -> GitHub API
- Backend subscription-poller.service.ts удаляется, cron переезжает в MCP
- MCP получает свою таблицу `mcp_issue_subscriptions` в той же PostgreSQL
- Callback: MCP -> POST backend /api/internal/subscription-callback (shared secret)
- LLM summary генерация остаётся в backend (MCP шлёт raw issues)

### Фронтенд-эксперт
- `subscribe` функция на фронте нигде не вызывается — мёртвый код
- SubscriptionIndicator, NotificationBubble, SSE-стрим — остаются без изменений
- Нужен refresh подписок после pipeline completion
- Баг: SSE type mismatch (`new_notification` vs `new_issue`)

### UI-дизайнер
- Индикатор подписок нужен даже при хранении в MCP
- Нет UI для отписки (по TTL, решение пользователя)
- Нужен feedback при создании подписки через AI

## Решения пользователя
- Чтение подписок: backend вызывает MCP tool `list_subscriptions`
- MCP tools: `subscribe_to_issues` (для AI) + `list_subscriptions` (для backend)
- SSE баг: исправить в рамках этой задачи
