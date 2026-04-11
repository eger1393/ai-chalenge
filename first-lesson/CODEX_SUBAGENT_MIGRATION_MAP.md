# Карта миграции консилиума: Claude Code -> Codex

Этот файл фиксирует, чем заменить роли и привычный workflow из Claude Code в Codex, чтобы сохранить максимально похожий стиль работы.

Исходная цель: вместо абстрактных `voltagent-*` использовать реальные Codex-совместимые skills / plugins / роли субагентов, которые уже существуют публично и могут быть установлены или использованы как ориентир.

## Базовый принцип миграции

В Claude Code у тебя были именованные субагенты с устойчивыми ролями.  
В Codex это лучше раскладывать на 3 слоя:

1. `AGENTS.md` — общие правила orchestration и workflow проекта
2. `spawn_agent` — реальный запуск субагентов на Research / Diagnose / review-задачи
3. Skills / plugins — reusable prompt-packages, которые задают специализацию субагента

Иными словами: в Codex роль = не один магический `subagent_type`, а связка:

- роль в workflow
- тип субагента (`explorer` / `worker` / `default`)
- skill / plugin / prompt-профиль

## Фактически установленные skills

По состоянию на **11 апреля 2026** в `C:\Users\eger1\.codex\skills` установлены:

- `backend-development`
- `database-design`
- `react-best-practices`
- `next-best-practices`
- `frontend-design`
- `web-design-guidelines`
- `webapp-testing`

Не удалось установить как было указано в ранней карте:

- `skillcreatorai/code-review` — в актуальном upstream skill отсутствует
- `skillcreatorai/javascript-typescript` — в актуальном upstream skill отсутствует

Поэтому дальнейшая миграция должна опираться на реально установленные skills выше.

## Карта соответствий по ролям

| Роль в Claude Code | Старый subagent_type | Роль в Codex | Рекомендуемый skill / plugin | Когда использовать |
| --- | --- | --- | --- | --- |
| Архитектор | `voltagent-qa-sec:code-reviewer` | `explorer` или `default` | `wshobson/agents` (`architect-review`, `code-reviewer`) как референсная модель; в установленном наборе основной practical skill — `backend-development`, при БД-анализе — `database-design` | Архитектура, границы модулей, зависимости, риски изменений |
| Фронтенд-эксперт | `voltagent-lang:react-specialist` | `explorer` для анализа, `worker` для реализации | `vercel-labs/react-best-practices`, дополнительно `vercel-labs/next-best-practices` | React/Next.js, структура компонентов, performance, state/data-flow |
| UI-дизайнер | `voltagent-core-dev:ui-designer` | `explorer` для design review, `worker` для UI-реализации | `anthropics/frontend-design`, дополнительно `vercel-labs/web-design-guidelines`, при Figma-задачах — Figma plugin / figma skills | Визуал, UX, композиция, интерфейсные паттерны, дизайн-система |

## Карта соответствий для Executing

### Backend Executing

Старое значение:

- `voltagent-lang:typescript-pro`

Codex-замена:

- Основной skill: `skillcreatorai/backend-development`
- При schema / SQL-heavy задачах: `skillcreatorai/database-design`

Рекомендуемый тип субагента:

- `worker`

Зона ответственности:

- NestJS / Node.js / TypeScript
- API, сервисы, модули, интеграции
- SQL и работа с PostgreSQL

### Frontend Executing

Старое значение:

- `voltagent-lang:react-specialist`

Codex-замена:

- Основной skill: `vercel-labs/react-best-practices`
- Для Next.js-специфики: `vercel-labs/next-best-practices`
- Для визуально сложных задач: `anthropics/frontend-design`

Рекомендуемый тип субагента:

- `worker`

Зона ответственности:

- React / Next.js / TypeScript
- Компоненты, страницы, composition patterns
- UI state, rendering, UX и визуальная реализация

## Как переносить стадии workflow

### Research

Вместо одного длинного анализа:

1. Запускать параллельно минимум 2-3 субагента
2. Делить зоны ответственности:
   - Архитектура / зависимости
   - Frontend / React / Next
   - UX / UI / визуальная часть
3. Сводить результаты в одном coordinating agent

Рекомендуемый состав:

- `Архитектор` -> `explorer` + `architect-review`
- `Фронтенд-эксперт` -> `explorer` + `react-best-practices`
- `UI-дизайнер` -> `explorer` + `frontend-design`

### Executing

Вместо универсального исполнителя:

- backend change -> `worker` + `backend-development`
- frontend change -> `worker` + `react-best-practices`
- UI-heavy frontend change -> `worker` + `frontend-design`

Если задача затрагивает и backend, и frontend:

- запускать 2 `worker`-субагента с разными зонами владения файлами

### Diagnose / Review

Для diagnose-консилиума в Codex можно использовать такую замену:

| Роль | Codex-замена | Основа |
| --- | --- | --- |
| Диагност | `explorer` | `webapp-testing` при UI/web-баге, `backend-development` при backend-поверхности |
| Архитектор | `explorer` | `backend-development`, `database-design`, референсно — `architect-review` |
| Фронтенд-эксперт | `explorer` | `react-best-practices`, `next-best-practices` |
| UI-дизайнер | `explorer` | `frontend-design`, `web-design-guidelines` |

## Рекомендуемый operating model для этого проекта

Чтобы работать со мной так же, как ты работал с Claude Code, имеет смысл принять следующие правила:

1. `Research`:
   - всегда считать стадией консилиума
   - по возможности запускать параллельных субагентов
2. `Executing`:
   - считать backend и frontend отдельными lane'ами
   - назначать каждому субагенту явную зону владения файлами
3. `Diagnose`:
   - отделять воспроизведение, diagnosis и fix
4. `Report`:
   - сохранять вывод в `swarm-report/<feature>/`

## Практический минимальный набор ролей для Codex

Если не хочется раздувать систему, достаточно такого ядра:

- `backend-development` для архитектурно-backend lane
- `react-best-practices` для frontend lane
- `next-best-practices` для Next.js lane
- `frontend-design` и `web-design-guidelines` для UI/UX lane
- `webapp-testing` для reproduce / diagnose web-багов

Это уже даёт почти тот же рабочий ритм, что был у тебя в Claude Code.

## Источники

- OpenAI skills catalog for Codex: https://github.com/openai/skills
- Vercel agent skills: https://github.com/vercel-labs/agent-skills
- `react-best-practices`: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md
- `web-design-guidelines`: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md
- Anthropic skills: https://github.com/anthropics/skills
- `frontend-design`: https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md
- `canvas-design`: https://raw.githubusercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md
- SkillCreator AI Agent Skills: https://github.com/skillcreatorai/Ai-Agent-Skills
- `code-review`: https://raw.githubusercontent.com/skillcreatorai/Ai-Agent-Skills/main/skills/code-review/SKILL.md
- `backend-development`: https://raw.githubusercontent.com/skillcreatorai/Ai-Agent-Skills/main/skills/backend-development/SKILL.md
- `database-design`: https://raw.githubusercontent.com/skillcreatorai/Ai-Agent-Skills/main/skills/database-design/SKILL.md
- `javascript-typescript`: https://raw.githubusercontent.com/skillcreatorai/Ai-Agent-Skills/main/skills/javascript-typescript/SKILL.md
- `wshobson/agents`: https://github.com/wshobson/agents
