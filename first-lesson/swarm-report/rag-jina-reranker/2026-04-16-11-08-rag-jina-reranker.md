# Отчёт: замена RAG reranker на многоязычную Jina-модель

## Задача

Заменить текущий reranker на многоязычную модель, которая нормально работает с
русскоязычным корпусом, и убрать тихий fallback на `filter`.

## Что реализовано

- `RAG_RERANKER_MODEL_ID` переведён на `jinaai/jina-reranker-v2-base-multilingual`
- Для reranker добавлен `dtype = q4`
- Порог `RAG_RERANKER_MIN_SCORE` снижен с `0.5` до `0.4`
- `RagRerankerService` переведён с `AutoModelForSequenceClassification` на
  `XLMRobertaModel`
- Оценка reranker теперь считается батчем для всего списка кандидатов
- Тихий fallback с `reranker` на `filter` удалён
- Подробные логи reranker сохранены
- `PROJECT_MAP.md` обновлён под фактический runtime-контракт

## Проверка

- `cd backend && npm run build`
- Локальный runtime-smoke новой модели:
  - русский релевантный кейс про Гарри Поттера дал `score ≈ 0.456`
  - релевантный кейс про `Claude Code` дал `score ≈ 0.600`
  - нерелевантный кейс про `Claude Code` дал `score ≈ 0.053`

## Ограничения и допущения

- Лицензия выбранной модели: `CC-BY-NC-4.0`
- Изменение пока не задеплоено на stage
- Исторические отчёты в `swarm-report` остаются как следы прошлых итераций

## Статус

Готово
