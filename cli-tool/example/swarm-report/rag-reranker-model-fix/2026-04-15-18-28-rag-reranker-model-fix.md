# Отчёт: исправление инициализации RAG reranker

## Задача

Исправить падение backend при инициализации режима `reranker` с ошибкой:

`filesystem error: cannot get file size: No such file or directory [/app/.cache/huggingface/onnx-community/bge-reranker-v2-m3-ONNX/onnx/model.onnx_data]`

## Проблема

Backend пытался загрузить модель `onnx-community/bge-reranker-v2-m3-ONNX`, которая в контейнере ожидала внешний файл `onnx/model.onnx_data`. При его отсутствии инициализация `reranker` завершалась исключением.

## Корневая причина

Выбранная ONNX-модель оказалась неудобной для текущего runtime-контейнера: она зависит от внешнего data-файла и не поднималась стабильно через текущий путь загрузки `@huggingface/transformers`.

## Что исправлено

- Для режима `reranker` выбрана совместимая модель `Xenova/bge-reranker-base`
- В `RagRerankerService` добавлен корректный сброс закэшированного промиса артефактов после неудачной загрузки
- В `RagService` добавлен безопасный fallback: если reranker недоступен, запрос продолжает работать через эвристический `filter`
- `PROJECT_MAP.md` обновлён под фактический runtime-контракт

## Проверка

- `cd backend && npm run build`
- Stage deploy: `docker compose up -d --build --force-recreate --no-deps backend`
- Логи backend на stage: приложение поднялось без ошибки `model.onnx_data`
- Runtime-проверка внутри контейнера: загрузка `Xenova/bge-reranker-base` завершилась с `reranker-ok`
- HTTP smoke: `GET /api/auth/me` вернул ожидаемый `401 Unauthorized`

## Ограничения и допущения

- Исправление не затрагивает уже сохранённые данные RAG и не требует переиндексации
- Отдельная stage-проблема с MCP-серверами, которые возвращают `0 tools`, не входила в этот фикс

## Статус

Исправлен
