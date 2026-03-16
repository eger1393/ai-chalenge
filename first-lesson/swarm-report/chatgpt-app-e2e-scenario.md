# E2E Scenario: ChatGPT App

Платформы: Backend, Web

## Backend API (curl)

- [x] 1. POST /api/auth/login с правильными credentials → 200, accessToken + refreshToken ✅ (проверено)
- [x] 2. POST /api/auth/login с неправильным паролем → 401 ✅ (проверено)
- [x] 3. GET /api/auth/me с валидным токеном → 200, {username: admin, role: admin} ✅ (проверено)
- [x] 4. GET /api/auth/me без токена → 401 ✅ (проверено)
- [x] 5. POST /api/auth/refresh с refreshToken → 200, новый accessToken ✅ (проверено)
- [x] 6. POST /api/chat/message без токена → 401 ✅ (проверено)

## Web UI (Browser)

- [x] 7. GET http://localhost:3001 → 307 redirect ✅ (проверено через curl)
- [x] 8. GET http://localhost:3001/login → 200 ✅ (проверено через curl)
- [x] 9. GET http://localhost:3001/chat → 200 ✅ (проверено через curl)
- [x] 10. Визуальная проверка UI логина ✅ (проверено через Chrome MCP — форма с полями username/password, кнопка "Войти", корректная верстка)
- [x] 11. Визуальная проверка чат-интерфейса ✅ (проверено через Chrome MCP — хедер с "admin"/"Выйти", заглушка "Начните диалог", поле ввода сообщения)

## Найденные и исправленные баги

1. **ADMIN_PASSWORD_HASH поврежден в Docker** — символы `$` в bcrypt-хеше интерпретировались docker-compose как переменные. Фикс: экранирование `$$` в `.env`.
2. **AuthProvider дублировался на каждой странице** — `/login` и `/chat` создавали свои `AuthProvider`, auth state терялся при навигации. Фикс: перенос `AuthProvider` в `layout.tsx`, удаление из страниц.

## Итог

- Backend: 6/6 проверок пройдено ✅
- Web: 5/5 проверок пройдено ✅ (включая визуальные)
