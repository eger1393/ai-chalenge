# Дедупликация уведомлений о GitHub issues

**Дата:** 2026-04-09

## Описание задачи

Пользователь получал дублирующиеся уведомления с разным текстом при подписке на GitHub issues.

## Итоги Research (сводка консилиума)

3 эксперта (Архитектор, Фронтенд-эксперт, UI-дизайнер) проанализировали код параллельно.

**Корневые причины:**

1. **Backend DB**: Дедупликация по `(subscription_id, issue_number)` — при пересоздании подписки (новый subscription_id, напр. после истечения TTL) unique constraint обходился. Summary генерировался OpenAI заново → разный текст.
2. **MCP Poller**: Одна транзакция на весь batch подписок — ROLLBACK после успешного callback откатывал watermark → повторная отправка тех же issues.
3. **Frontend**: `addNotification` не проверял дубли по id. Race condition между REST-загрузкой и SSE-потоком.

## План

3 уровня исправлений: Backend DB → MCP Poller → Frontend

## Что реализовано

### Уровень 1: Backend DB

- **`backend/src/database/migrations.service.ts`** — миграция 18: удаление дублей по `(conversation_id, issue_number)`, замена индекса `idx_issue_notif_dedup` на `idx_issue_notif_dedup_conv` по `(conversation_id, issue_number)`
- **`backend/src/notification/repositories/notification.repository.ts`** — ON CONFLICT заменён на `(conversation_id, issue_number) DO NOTHING`

### Уровень 2: MCP Poller

- **`github-explorer-mcp/src/poller.ts`** — полный рефакторинг:
  - Каждая подписка обрабатывается в отдельной транзакции (изоляция ошибок)
  - `pollOne` возвращает `PendingCallback | null` вместо void
  - Callback отправляется ПОСЛЕ COMMIT watermark'а
  - Вынесена функция `sendCallback`

### Уровень 3: Frontend

- **`frontend/src/hooks/use-notifications.ts`** — двухуровневая дедупликация:
  - `knownIdsRef` (Set) — быстрая проверка по id
  - Fallback: проверка по `(issueNumber, conversationId)` в массиве
  - `loadNotifications` синхронизирует knownIdsRef
  - `unreadCount` увеличивается только при реальном добавлении

## Результаты Validation

- Backend: tsc --noEmit ✓
- Frontend: tsc --noEmit ✓
- MCP Server: tsc --noEmit ✓

## Проблемы и откаты

Нет.

## Статус

**Done**
