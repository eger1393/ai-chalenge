# Фича: Инварианты задач + Удаление задач
**Дата:** 2026-04-02

## Описание
1. Каскадное удаление задач (с модальным подтверждением, удаляются привязанные диалоги)
2. Инварианты — неизменяемые текстовые правила привязанные к задаче, добавляются ко всем запросам

## Что реализовано

### Backend
| Файл | Что сделано |
|------|-------------|
| database.service.ts | Миграция 017: таблица task_invariants |
| task.service.ts | Каскадное удаление + CRUD инвариантов + getInvariantsByTaskId |
| task.controller.ts | 4 endpoint: GET/POST invariants, DELETE invariant, GET conversation-count |
| memory-assembler.service.ts | Инварианты как первый блок system prompt (высший приоритет) |
| pipeline.service.ts | Инварианты на всех этапах pipeline + явная проверка в validation |

### Frontend
| Файл | Что сделано |
|------|-------------|
| types/task.ts | TaskInvariant interface |
| lib/api.ts | 4 API функции для инвариантов + getTaskConversationCount |
| hooks/use-invariants.ts | Hook: load, add, remove, reset |
| conversation-sidebar.tsx | InvariantsSection + модалка удаления задачи + кнопка удаления |
| chat-layout.tsx | Бейдж инвариантов в header + интеграция hook |

## Результаты Validation
- Backend: tsc --noEmit — 0 ошибок
- Frontend: next build — Compiled successfully

## Ключевые решения
- Инварианты в отдельном блоке system prompt с жёсткой формулировкой "НАРУШЕНИЕ ЗАПРЕЩЕНО"
- Pipeline: инварианты на всех этапах + явная проверка в validation
- Каскадное удаление задач с модальным подтверждением
- Красный акцент для инвариантов (важность)

## Статус: Done
