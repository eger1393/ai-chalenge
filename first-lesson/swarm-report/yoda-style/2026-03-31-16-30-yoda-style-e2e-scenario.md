# E2E Scenario: Добавление стиля диалога "Мастер Йода"

Платформы: Backend

## Шаги

- [x] 1. Компиляция backend: `npx tsc --noEmit` проходит без ошибок
- [x] 2. Компиляция frontend: `npx tsc --noEmit` проходит без ошибок
- [x] 3. PUT /api/profile с dialogueStyle: 'yoda' возвращает 200 — dialogueStyle: "yoda"
- [x] 4. GET /api/profile возвращает dialogueStyle: 'yoda'
- [x] 5. PUT /api/profile с dialogueStyle: 'invalid_style' возвращает 400 (валидация работает)
