# E2E Scenario: Подсчёт токенов

Платформы: Backend

## Шаги

- [x] 1. Сборка backend проходит без ошибок (npm run build) ✅
- [x] 2. Сборка frontend проходит без ошибок (npm run build) ✅
- [x] 3. TypeScript компиляция backend без ошибок (tsc --noEmit) ✅
- [x] 4. TypeScript компиляция frontend без ошибок (tsc --noEmit) ✅
- [x] 5. js-tiktoken установлен в backend/node_modules ✅
- [x] 6. getConversationTotals метод есть в conversation.service.ts (строка 253) ✅
- [x] 7. findOne возвращает camelCase поля (tokenCount, promptTokens, completionTokens) ✅
- [x] 8. sendMessage response содержит currentMessageTokens, historyTokens, systemPromptTokens ✅
- [x] 9. sendConsilium response содержит conversationTotals (строка 511) ✅
- [x] 10. Frontend типы содержат ConversationTotals и расширенный Usage ✅
- [x] 11. chat-layout передаёт usage и durationMs в MessageBubble (строки 179-180) ✅
- [x] 12. context-indicator принимает и отображает conversationTotals ✅
