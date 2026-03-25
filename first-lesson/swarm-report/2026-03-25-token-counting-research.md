# Research: Подсчёт токенов в ChatGPT-клиенте

Дата: 2026-03-25

## Консилиум

### Архитектор
- Данные о токенах уже сохраняются в БД (messages: token_count, prompt_tokens, completion_tokens, cost)
- OpenAI возвращает точные usage данные — prompt_tokens, completion_tokens, total_tokens
- estimateTokens() — эвристика length/4, неточна для кириллицы
- При загрузке истории token-данные не маппятся на фронте
- Новых миграций БД не требуется

### Фронтенд-эксперт
- applied-params-display.tsx уже отображает usage для свежих ответов
- **БАГ**: chat-layout.tsx не передаёт usage и durationMs в MessageBubble
- **БАГ**: loadConversation не маппит token-поля из БД
- ConversationMessage не содержит полей usage
- Нужна агрегированная статистика сессии

### UI-дизайнер
- Per-message: улучшить applied-params-display (in/out вместо стрелок)
- Context-wide: расширить context-indicator — добавить абсолютные цифры + суммарную стоимость
- Иконки: Layers (контекст), Coins (стоимость), не перегружать per-message иконками
- Цветовая палитра: sky-500, emerald-600, amber-500, gray-400/500

### API-дизайнер
- Добавить conversationTotals в response (totalMessages, totalTokens, totalPromptTokens, totalCompletionTokens, totalCost)
- Добавить contextWindow в consilium response
- Добавить per-expert usage в consilium expertOpinions
- Отдельный endpoint не нужен — достаточно inline данных
- Все изменения аддитивные, обратно совместимые

### DevOps
- Изменений docker-compose/Dockerfile не требуется
- Новых env-переменных не требуется
- Рекомендация: js-tiktoken для точного подсчёта (опционально)
- Текущая зависимость для токенизации отсутствует в package.json
