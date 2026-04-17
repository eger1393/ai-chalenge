# Отчёт: валидация и усиление RAG-ветки

## Задача

Провалидировать текущую реализацию RAG как сквозной контур и устранить системную хрупкость strict RAG, из-за которой сообщения падали с `Exhausted all retry attempts`.

## Что обнаружено

- Retrieval работал корректно: query rewrite, vector search и reranker находили сильные чанки по запросам про `Claude Code`
- Основная проблема была в strict RAG planning:
  - модель возвращала свободный текст вместо надёжного контракта
  - planning мог упрямо выбирать `REFUSE` при уже сильных релевантных чанках
  - оркестратор отвечал на это только повторными попытками и в итоге выбивал сообщение в `Exhausted all retry attempts`
- Ветка strict RAG в целом слишком зависела от свободного текста модели и regex-парсинга там, где нужен структурированный контракт

## Что реализовано

- Переведён strict RAG planning на структурированный JSON-контракт:
  - `ragVerdict`
  - `responseMode`
  - `chunkIds`
  - `missingInfo`
  - `planSteps`
- Переведён strict RAG execution на структурированный JSON-контракт:
  - для ответа: `mode`, `summary`, `references[]`
  - для отказа: `mode`, `reason`, `missingInfo`
- Backend теперь:
  - сначала пытается распарсить JSON-контракт
  - поддерживает legacy-формат как fallback совместимости
  - канонизирует strict RAG план перед передачей в execution/validation
- Добавлен явный `policy_repair` для strict RAG planning:
  - если planning сломан по формату или ошибочно выбирает `REFUSE`
  - и при этом в текущем RAG-блоке уже есть сильные прямые чанки
  - backend синтезирует канонический план `ANSWER` вместо бесполезных ретраев
- `policy_repair` сделан наблюдаемым:
  - причина repair сохраняется в planning metadata
  - источник плана (`model` или `policy_repair`) сохраняется в debug
  - debug-панель фронта показывает источник плана и причину repair
- Усилена кодовая проверка strict RAG execution для структурированного ответа:
  - `chunkId` должен входить в `CHUNKS_USED`
  - цитата должна реально содержаться в соответствующем чанке
  - explanation не может быть пустым
  - structured path не должен смешиваться с markdown-форматом

## Изменённые файлы

- `backend/src/message-processing/services/step-runner.service.ts`
- `backend/src/message-processing/services/step-orchestrator.service.ts`
- `frontend/src/components/chat/debug-panel.tsx`
- `PROJECT_MAP.md`

## Проверка

- `cd backend && npm run build`
- `cd frontend && npm run build`
- `git diff --check`
- Локальный smoke для нового structured execution-path:
  - JSON planning успешно парсится
  - JSON execution с `chunkId` и цитатой проходит кодовую проверку

## Ограничения и допущения

- Полноценного автоматического test-suite в backend сейчас нет, поэтому проверка опирается на сборку и targeted smoke
- Legacy parsing оставлен как совместимость на переходный период, но канонический strict RAG путь теперь структурированный
- Stage-деплой в этот отчёт не входит

## Статус

Готово
