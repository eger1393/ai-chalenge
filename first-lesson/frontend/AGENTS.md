# Frontend AGENTS

## OVERVIEW

Next.js SPA для чата, параметров модели, pipeline-диагностики и управления диалогами

## WHERE TO LOOK

- `src/app/` — маршруты и layout
- `src/components/chat/` — основной интерфейс чата
- `src/hooks/` — состояние, API-вызовы и SSE
- `src/lib/api.ts` — клиентский HTTP-контракт
- `src/types/` — типы диалогов, pipeline и AI-параметров

## SOURCE OF TRUTH

- Источник истины для серверных данных — `src/lib/api.ts` и ответы backend
- Источник истины для локальных AI-параметров — `src/hooks/use-ai-params.ts`
- Источник истины для envelope → UI mapping — `src/hooks/use-chat.ts`

## CONVENTIONS

- Старайся вести API-взаимодействие через существующие hooks, а не из глубины компонентов
- Переключение активного диалога должно гидрировать серверные RAG-настройки обратно в локальное состояние
- Pipeline и debug-панель должны отображать реальные backend-контракты, а не локальные догадки
- Новые поля backend debug нужно протягивать через `types/` и `debug-panel`, а не прятать в `any`

## ANTI-PATTERNS

- Не позволяй локальным preset-ам перекрывать уже загруженное состояние активного диалога
- Не изобретай отдельную фронтенд-схему сообщений, если envelope уже покрывает сценарий
- Не дублируй API-вызовы в нескольких компонентах при наличии профильного hook

## COMMANDS

```bash
npm run dev
npm run build
```
