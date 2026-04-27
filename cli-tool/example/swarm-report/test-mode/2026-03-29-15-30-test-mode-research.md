# Research: Режим тестирования контекстных стратегий

Дата: 2026-03-29

## Задача
Новый режим "Тестирование": генерация диалога на заданную тему (AI за обе стороны), расширенная debug-информация по стратегиям контекста, возможность продолжить вручную.

## Решения консилиума

### Архитектура
- POST /chat/generate-test с SSE-стримингом (пары сообщений приходят по мере генерации)
- Переиспользование sendMessage внутри цикла на бэкенде
- Генерация "пользователя": отдельный вызов gpt-4.1-nano
- Флаг is_test в conversations + test_topic
- Debug-данные в message_debug_data (JSONB)
- verbose флаг в strategyParams для расширенной metadata

### API контракт
- POST /chat/generate-test { topic, messageCount, params, userSimulation? }
- SSE events: started, pair (с debug), completed, error
- Расширение findAll: фильтр includeTests

### UI
- Переключатель "Чат/Тест" в header (amber-цвет для тестового)
- TestSetupForm вместо EmptyState (тема + slider 5-50 пар)
- Inline progress bar + кнопка "Остановить"
- DebugPanel: collapsible, token breakdown, strategy details, стоимость
- Приглушённые user-bubbles для сгенерированных сообщений

### Миграции
- conversations: is_test BOOLEAN, test_topic VARCHAR(500)
- message_debug_data: message_id, strategy_type, sent_messages JSONB, strategy_debug JSONB
