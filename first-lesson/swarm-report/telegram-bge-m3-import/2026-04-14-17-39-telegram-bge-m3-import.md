# Отчёт по задаче: импорт Telegram-канала в knowledge base с embeddings `bge-m3`

## Статус

Частично

## Краткое описание задачи

Добавить в `knowledge-base-mcp` контур хранения Telegram-дампа:

- отдельную таблицу для полных сообщений
- отдельную таблицу для чанков
- векторизацию чанков через `BAAI/bge-m3`

## Что реализовано

- В `knowledge-base-mcp/src/db.ts` добавлены:
  - `CREATE EXTENSION IF NOT EXISTS vector`
  - таблица `telegram_channel_messages`
  - таблица `telegram_message_chunks`
- В `knowledge-base-mcp/src/import-telegram-dump.ts` добавлен CLI-импортёр:
  - читает Telegram JSON dump
  - сохраняет все сообщения в `telegram_channel_messages`
  - режет текстовые сообщения на чанки
  - считает embeddings размерности `1024`
  - сохраняет чанки и метадату в `telegram_message_chunks`
- В `knowledge-base-mcp/package.json` добавлен скрипт:
  - `npm run import:telegram -- ../result.json`
- В `docker-compose.yml` PostgreSQL переведён на `pgvector/pgvector:pg16`
- В `knowledge-base-mcp/Dockerfile` базовый образ заменён на `node:20-bookworm-slim`
  - это уменьшает риск проблем с ML-зависимостями и ONNX-рантаймом
- В `PROJECT_MAP.md` обновлена карта проекта под новые таблицы и импортёр

## Важное техническое решение

Запрошенная модель `BAAI/bge-m3` в Node-контуре через `Transformers.js` не стартовала напрямую из-за ONNX-артефактов исходного репозитория.

Для рабочего рантайма использован `Xenova/bge-m3` как совместимый ONNX-порт модели `BAAI/bge-m3`. В коде это зафиксировано отдельно:

- `source_model`: `BAAI/bge-m3`
- `runtime_model`: `Xenova/bge-m3`

## Проверки

- `npm run build` в `knowledge-base-mcp` — успешно
- smoke-test загрузки `Xenova/bge-m3` и построения embedding — успешно
  - результат: `dims = [1, 1024]`
- `node dist/import-telegram-dump.js` без аргументов — корректно отдал диагностическую ошибку CLI

## Ограничения и допущения

- Полный импорт `result.json` в реальную БД не запускался в этой сессии
- `docker compose config -q` не прошёл из-за отсутствующего `.env`, а не из-за ошибки в изменённом коде
- Поиск, retrieval и RAG-обвязка сознательно не добавлялись

