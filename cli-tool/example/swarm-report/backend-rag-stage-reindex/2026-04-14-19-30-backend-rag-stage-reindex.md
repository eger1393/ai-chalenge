# Отчёт по задаче: backend RAG на stage и переиндексация Telegram-дампа

## Статус

Готово

## Краткое описание задачи

Перенести контур RAG из `knowledge-base-mcp` в основной backend, добавить флаг `RAG` во frontend, развернуть изменения на stage и заново проиндексировать `result.json` в `chatdb`.

## Что выполнено

- В backend добавлен отдельный модуль `rag/` с:
  - хранением документов в `rag_documents`
  - хранением чанков и embeddings в `rag_chunks`
  - CLI-переиндексацией Telegram JSON
  - retrieval-блоком для подмешивания контекста при `rag_enabled = true`
- В `conversations` добавлен флаг `rag_enabled`
- Во frontend добавлен переключатель `RAG` и проброс параметра в API создания и обновления диалога, а также в отправку сообщения
- Backend-контейнер переведён на `node:20-bookworm-slim`
- Для runtime-кэша embeddings подготовлена директория `/app/.cache/huggingface` с правами для `appuser`
- В `.dockerignore` backend исключён локальный `.cache`, чтобы не раздувать Docker-контекст
- Изменения выложены на stage адресной перекладкой `backend` и `frontend`
- `result.json` заново проиндексирован в `chatdb` через backend CLI

## Проблемы по ходу работы

- После первой выкладки backend падал при старте:
  - причина: default-import из `node:path` в CommonJS-сборке
  - симптом: `Cannot read properties of undefined (reading 'resolve')`
- Исправление:
  - переход на namespace-import для `node:path` и `node:fs/promises`
  - повторная перекладка только backend

## Проверки

- Локально:
  - `backend`: `npm run build` — успешно
  - `frontend`: `npm run build` — успешно
- Stage:
  - `docker compose up -d --build backend frontend` — успешно
  - backend стартовал и прошёл миграции
  - frontend отвечает по `http://167.235.226.104:6501`
  - backend отвечает по `http://167.235.226.104:6500/api` и корректно возвращает `401` на защищённый endpoint без токена
- Переиндексация:
  - backend CLI завершился со статусом `ok`
  - источник: `telegram_channel / 1642182031 / Алексей Гладков`
  - модель источника: `BAAI/bge-m3`
  - runtime-модель: `Xenova/bge-m3`
- SQL-сверка после импорта:
  - `rag_documents = 6579`
  - `rag_chunks = 5539`
  - документов с чанками = `5321`
  - размерность вектора = `1024`
- Выборочная проверка:
  - сообщение `4` присутствует в `rag_documents` с полным текстом и метаданными канала
  - сообщение `6922` разбито на `3` чанка

## Ограничения и допущения

- Для Node runtime используется совместимый ONNX-порт `Xenova/bge-m3`, при этом в метаданных сохраняется исходная модель `BAAI/bge-m3`
- Импортёр делает upsert документов и полную пересборку чанков для каждого сообщения, но не занимается синхронизацией удалённых сообщений при изменении состава дампа
