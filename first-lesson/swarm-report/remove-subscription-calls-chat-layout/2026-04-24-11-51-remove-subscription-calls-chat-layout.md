# Отчёт: remove-subscription-calls-chat-layout

- Дата: `2026-04-24 11:51`
- Статус: `Готово`

## Что найдено

Даже после отключения сетевого запроса в `useSubscriptions`, `ChatLayout` всё ещё продолжал вызывать `loadSubscriptions()` в двух местах:

- при смене активного диалога
- после перезагрузки диалога после pipeline completion

Сами эти вызовы больше не делали HTTP, но именно они были исходной точкой возникновения запросов в предыдущей версии фронта.

## Что изменено

- В `frontend/src/components/chat/chat-layout.tsx` удалены оба вызова `loadSubscriptions()`.
- Удалён лишний `loadSubscriptions` из destructuring `useNotificationContext()`.
- Удалена зависимость `loadSubscriptions` из `useEffect`.

## Валидация

- Сборка не запускалась по прямому указанию пользователя.
