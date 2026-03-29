# Deploy: Conversation Persistence

Дата: 2026-03-24 12:49

## Что задеплоено
- Коммит: c4cddc2 `feat: conversation persistence with PostgreSQL + sidebar UI`
- PostgreSQL добавлен как Docker-сервис с named volume `pgdata`
- Миграция таблиц (conversations, messages, expert_opinions) выполнена автоматически
- ConversationController: 5 REST-эндпоинтов
- ChatService: поддержка conversationId, автообрезка контекста
- Frontend: sidebar с историей диалогов, context indicator

## Результат: Deployed

### Статус контейнеров
| Контейнер | Статус | Порт |
|-----------|--------|------|
| first-lesson-postgres-1 | Up | 5432 (internal) |
| first-lesson-backend-1 | Up | 6500→3000 |
| first-lesson-frontend-1 | Up | 6501→3000 |

### Логи backend
- Connected to PostgreSQL ✅
- Migration applied: 001_create_conversations ✅
- Nest application successfully started ✅
- Все роуты зарегистрированы (chat + conversations) ✅

## Ручные действия на сервере
- DATABASE_URL добавлен в /srv/ai-chalange/first-lesson/.env ✅
- docker-compose.yml обновлён с серверными портами (6500/6501) + postgres ✅

## Проблемы
- SSH таймаут при первой попытке — решён повторной попыткой
- docker-compose.yml конфликт (серверные порты отличаются от репозитория) — файл обновлён вручную на сервере

## Статус: Deployed
