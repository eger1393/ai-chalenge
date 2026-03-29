# Deploy: Подсчёт токенов

Дата: 2026-03-25 13:15 UTC

## Что задеплоено
Коммит: c9cf358 — feat: add token counting with breakdown (prompt/history/completion) + conversation totals

Изменения:
- Backend: js-tiktoken для точного подсчёта, разбивка токенов в API response, conversationTotals
- Frontend: расширенные типы, исправлены баги отображения usage, суммарная статистика в context-indicator
- 14 файлов изменено, 357 вставок, 59 удалений

## Результат
- git push: OK (fast-forward c4cddc2..c9cf358)
- docker compose build: OK (backend + frontend собрались без ошибок)
- Контейнеры после деплоя:
  - postgres: Up
  - backend (порт 6500): Up, Nest application successfully started
  - frontend (порт 6501): Up
- Ошибок в логах: нет

## Проблемы
Нет

## Статус: Deployed
