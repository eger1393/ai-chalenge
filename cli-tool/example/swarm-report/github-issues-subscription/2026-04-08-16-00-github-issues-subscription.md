# Фича: GitHub Issues Subscription через MCP

**Дата:** 2026-04-08  
**Статус:** Done

## Описание задачи

Реализация подписки на новые GitHub issues через MCP. Пользователь может подписаться на issues репозитория через чат. Система каждые 5 минут проверяет новые issues, генерирует AI summary и отправляет inline-уведомление в чат через SSE.

## Итоги Research (сводка консилиума)

Ключевое архитектурное решение: **backend-side polling вместо webhook**. MCP протокол не поддерживает server-initiated push к внешним сервисам. Backend сам вызывает MCP tool через McpToolRouter + @Cron.

Другие решения:
- Persistent SSE для push (не WebSocket) — проект уже использует SSE паттерн
- Отдельные таблицы issue_subscriptions и issue_notifications (не в messages)
- Teal палитра для UI уведомлений

## План

10 шагов: npm install → MCP tool → миграции → notification module → subscription module → AppModule → frontend типы/API → хуки → context → UI компоненты.

## Что реализовано

### github-explorer-mcp
- Новый tool `check_new_issues` — принимает repository + since, возвращает новые issues из GitHub API
- GITHUB_TOKEN добавлен в docker-compose.yml

### Backend — модуль notification
- `notification.repository.ts` — CRUD для issue_notifications (raw SQL)
- `notification-gateway.service.ts` — SSE push hub (Map<userId, Subject>)
- `notification.service.ts` — бизнес-логика (createAndPush, history, markRead)
- `notification.controller.ts` — SSE endpoint (JWT в query param) + REST API

### Backend — модуль subscription
- `subscription.repository.ts` — CRUD для issue_subscriptions (raw SQL)
- `subscription.service.ts` — создание подписок, проверка дубликатов и владельца
- `subscription-poller.service.ts` — @Cron каждые 5 минут, вызов MCP tool, LLM summary через OpenAI, push через notification service
- `subscription.controller.ts` — REST API (create, list, list by conversation)

### Backend — миграции
- Таблица `issue_subscriptions` (9 полей, 3 индекса включая UNIQUE partial)
- Таблица `issue_notifications` (10 полей, 3 индекса включая partial)

### Frontend
- Типы: `IssueSubscription`, `IssueNotification`, `NotificationSSEEvent`
- API: 6 новых функций в lib/api.ts
- Хуки: `use-notification-stream` (persistent SSE), `use-subscriptions`, `use-notifications`
- Context: `NotificationProvider` в layout.tsx
- UI: `NotificationBubble` (teal палитра, react-markdown), `SubscriptionIndicator` (progress bar TTL)
- Интеграция в `chat-layout.tsx`: timeline merge messages + notifications

### Зависимости
- Backend: @nestjs/schedule
- Frontend: react-markdown, remark-gfm

## Результаты Validation

- Backend: `tsc --noEmit` — без ошибок
- Frontend: `next build` — compiled successfully
- github-explorer-mcp: `tsc --noEmit` — без ошибок

## Проблемы и откаты

Нет.

## Env-переменные (новые)
- `GITHUB_TOKEN` — токен GitHub для github-explorer-mcp (scope: public_repo)
