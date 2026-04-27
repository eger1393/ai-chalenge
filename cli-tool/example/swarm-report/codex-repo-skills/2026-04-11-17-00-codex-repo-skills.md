# Codex Repo Skills

Дата: 2026-04-11 17:00
Статус: Done
Профиль: Фича

## Краткое описание задачи

Выяснить, почему локальные skills из `.agents` не появились в текущей сессии Codex, и зафиксировать repo-local способ не повторять это поведение в следующих сессиях именно в этом репозитории.

## Итоги Research

- В проекте действительно есть repo-local plugin:
  - `.agents/plugins/marketplace.json`
  - `.agents/plugins/plugins/first-lesson-local/.codex-plugin/plugin.json`
  - локальные skills `deploy` и `interview`
- Структура plugin-путей корректна: `source.path` из marketplace резолвится в `.agents/plugins/plugins/first-lesson-local`.
- В developer-контексте текущей сессии в список доступных skills попали только системные skills из `/root/.codex/skills/.system/...`.
- В логах старта Codex обнаружен plugin discovery только для домашнего каталога `/root/.codex/.tmp/plugins` и remote plugin sync.
- Признаков чтения repo-local `.agents/plugins/marketplace.json` при старте текущей сессии не найдено.

## План

1. Зафиксировать в документации реальное поведение рантайма, а не желаемое.
2. Добавить repo-local правило, которое обязывает новую сессию вручную подхватывать локальные `SKILL.md` из `.agents`, если запрос пользователя совпадает с ними по смыслу.
3. Сохранить отчёт для будущих сессий и диагностики.

## Что реализовано

- Обновлён `AGENTS.md`:
  - добавлен раздел про локальные skills проекта в `.agents/.../skills/`
  - закреплено обязательное ручное чтение project-local `SKILL.md`, если рантайм не зарегистрировал их автоматически
- Обновлён `CODEX_MIGRATION.md`:
  - убрано ложное ожидание, что `INSTALLED_BY_DEFAULT` гарантирует автоподхват repo-local plugin
  - добавлено описание фактического поведения Codex `0.120.0` в текущем окружении

## Результаты Validation

- Проверены пути до локального plugin и `SKILL.md` файлов.
- Проверены логи Codex: найден startup discovery домашнего plugin-каталога `/root/.codex/.tmp/plugins`, но не repo-local `.agents/plugins/marketplace.json`.
- Документация в репозитории теперь явно описывает ограничение рантайма и repo-local fallback-процедуру.

## Проблемы и откаты

- Из одного только репозитория нельзя заставить текущий рантайм Codex изменить свой discovery pipeline на старте сессии.
- Поэтому исправление сделано на уровне repo instructions: следующая сессия должна подхватывать локальные skill-файлы через `AGENTS.md`, даже если built-in registry их не показывает.
