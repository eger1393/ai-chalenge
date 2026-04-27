# Отчёт по задаче: усиление backend ownership, удаление ветвления и стабилизация RAG

## Задача

Реализовать утверждённый план по backend-ревью:

- закрыть дыры ownership для `project`, `conversation`, `message`, `context`, `debug`
- убрать продуктовый контур ветвления и checkpoint API
- стабилизировать `reranker`
- убрать дублирование и перекосы в сборке prompt/context
- синхронизировать frontend и документацию с новым контрактом

## Что реализовано

### Безопасность и ownership

- `ProjectController` и `ProjectService` теперь валидируют ownership для инвариантов
- `ConversationService.create()` проверяет принадлежность `projectId` текущему пользователю
- `ConversationService.findAll(userId, projectId)` теперь сначала валидирует проект, затем отдаёт только owned conversations
- `MessageRepository` получил `findOwnedById()`, а `MessageController` использует его для `pause`, `resume`, `cancel`, `GET /messages/:id`, `GET /messages/:id/debug`
- `ContextController` перед любой операцией валидирует, что разговор принадлежит текущему пользователю

### Контекст и ветвление

- из публичного backend-контракта удалены `branches` и `checkpoints`
- удалены branch/checkpoint DTO, репозитории и стратегия `branching`
- `ContextStrategyType` сужен до `sliding_window | sticky_facts`
- legacy-значение `branching` автоматически нормализуется в `sliding_window`, чтобы старые записи не ломали выполнение
- `MessageRepository.getForContext()` больше не branch-aware и всегда собирает контекст по `conversation_id`

### Prompt assembly и facts

- `MemoryAssemblerService` больше не вклеивает инварианты в `systemPrompt`; инварианты остаются только как слой памяти для debug
- `StepRunnerService` теперь добавляет текущий пользовательский запрос в planning/execution/validation ровно один раз
- context strategies возвращают только предшествующий контекст, без дублирования текущего user turn
- `sticky_facts` продолжает влиять на retrieval через retrieval hint и теперь не конфликтует с новым prompt-order
- во frontend исправлен факт-API: ручное сохранение facts теперь использует корректный `PUT`

### RAG и reranker

- `rag-reranker.service.ts` переведён на `XLMRobertaForSequenceClassification`
- добавлена fail-fast валидация формы logits и размера batch
- сохранён явный режим ошибки для `reranker`, без тихого fallback в `filter`

### Frontend и контракты

- удалены branch/checkpoint API-вызовы, hook и UI-компоненты
- selector стратегии оставляет только `Окно` и `Факты`
- debug-панель и conversation types синхронизированы с новым контрактом
- `PROJECT_MAP.md` обновлён под новое целевое состояние

## Проверка

- `backend ./node_modules/.bin/tsc -p tsconfig.build.json --pretty false`
- `frontend ./node_modules/.bin/tsc -p tsconfig.json --noEmit --pretty false`
- `frontend ./node_modules/.bin/next build`
- `git diff --check`

Все проверки завершились успешно

## Ограничения и допущения

- legacy-таблицы `conversation_branches`, `checkpoints`, а также поля `messages.branch_id` и `conversation_contexts.active_branch_id` сохранены в схеме, но больше не используются публичным контуром
- отдельного тестового контура `unit/integration` в backend по-прежнему нет; валидация выполнена типами и сборкой
- в рабочем дереве уже были другие незакоммиченные изменения по RAG; они не откатывались и не переписывались

## Статус

Готово
