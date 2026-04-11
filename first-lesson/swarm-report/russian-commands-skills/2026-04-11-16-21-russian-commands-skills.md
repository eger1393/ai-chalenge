# Russian Commands And Skills

Дата: 2026-04-11 16:21
Статус: Done
Профиль: Фича

## Краткое описание задачи

Локализовать пользовательские тексты в `commands` и `skills`, чтобы в этих точках проекта всё отображалось на русском языке.

## Итоги Research

- Найдены две группы целевых файлов:
  - исходные команды в `.claude/commands/`
  - локальный Codex plugin в `.agents/plugins/plugins/first-lesson-local/` с `commands`, `skills` и `plugin.json`
- Выявлен риск: перевод технических идентификаторов и enum-значений в `plugin.json` мог сломать резолвинг или UI-парсинг плагина.
- Принято решение переводить пользовательские описания, заголовки и подсказки, но не менять стабильные идентификаторы (`name`, пути, slug-и, служебные ключи).

## План

1. Перевести пользовательские тексты в локальных plugin-командах и skill.
2. Синхронизировать русификацию в исходных `.claude`-командах и reference-файле skill'а.
3. Проверить, что в целевых `commands/skills` не осталось англоязычных заголовков и описаний.
4. Прогнать компиляцию backend и frontend.

## Что реализовано

- Переведены пользовательские описания и заголовки в:
  - `.agents/plugins/plugins/first-lesson-local/commands/deploy.md`
  - `.agents/plugins/plugins/first-lesson-local/commands/interview.md`
  - `.agents/plugins/plugins/first-lesson-local/skills/deploy/SKILL.md`
  - `.agents/plugins/plugins/first-lesson-local/.codex-plugin/plugin.json`
- Синхронизированы исходные команды:
  - `.claude/commands/deploy.md`
  - `.claude/commands/interview.md`
- Синхронизирован reference-файл:
  - `.agents/plugins/plugins/first-lesson-local/skills/deploy/references/claude-deploy.md`
- В `plugin.json` сохранены технические enum-значения `category` и `capabilities` в исходном виде для совместимости.

## Результаты Validation

- Поиск по целевым каталогам не нашёл остаточных англоязычных заголовков и описаний.
- `backend`: `npx tsc --noEmit` — успешно.
- `frontend`: `npx tsc --noEmit` — успешно.

## Проблемы и откаты

- Рабочее дерево изначально было не чистым: присутствуют сторонние изменения и untracked-файлы, не относящиеся к этой задаче.
- Каталог `.agents/` сейчас отображается как untracked, поэтому локализация plugin-файлов останется локальной, пока эти файлы не будут добавлены в git по вашему решению.

