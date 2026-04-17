# Chat Components AGENTS

## OVERVIEW

Этот каталог содержит основной чатовый интерфейс, правую панель параметров, pipeline UI и debug-отображение

## WHERE TO LOOK

- `chat-layout.tsx` — главный оркестратор и связывание hooks
- `chat-window.tsx`, `message-bubble.tsx`, `chat-input.tsx` — базовый поток сообщений
- `ai-params-panel.tsx` — параметры модели и RAG
- `pipeline-message-bubble.tsx`, `pipeline-stepper.tsx`, `pipeline-controls.tsx` — pipeline UI
- `debug-panel.tsx` — источник истины для отображения backend debug
- `conversation-sidebar.tsx` — проекты, диалоги и выбор активного контекста

## SOURCE OF TRUTH

- Источник истины для композиции экрана — `chat-layout.tsx`
- Источник истины для debug-рендеринга — контракт `MessageDebugData` + `debug-panel.tsx`
- Источник истины для управления RAG-тумблерами — `ai-params-panel.tsx` вместе с `use-ai-params`

## CONVENTIONS

- Новые элементы pipeline/debug должны встраиваться в существующий таймлайн и не ломать порядок сообщений
- Для RAG-настроек придерживайся пары: локальный preset в hook и серверная гидрация при загрузке диалога
- Если backend добавляет новый strict RAG debug, сначала обновляй тип, затем панель, затем вспомогательные подписи

## ANTI-PATTERNS

- Не вычисляй “виртуальный” debug на клиенте, если он должен прийти с сервера
- Не разрывай связь между `conversation detail` и текущими RAG-настройками панели
- Не размазывай orchestration-логику по нескольким компонентам, если она уже живёт в `chat-layout.tsx`

## COMMANDS

```bash
cd /mnt/c/source/ai-chalenge/first-lesson/frontend
npm run build
```
