# docs-rag: реализация шагов 1-3

Дата: 2026-04-27

## Краткое описание задачи

Реализовать первые три шага плана `docs-rag-tool`: исследовать структуру проекта, создать TypeScript CLI-каркас `docs-rag`, реализовать создание и валидацию `.docs-rag/config.json` через команду `init`.

## Итоги Research

- В корне `cli-tool` не было основного `package.json`; существующий `.opencode/package.json` относится к OpenCode-интеграции и не подходит для core CLI.
- Принято решение разместить standalone CLI в `tools/docs-rag`, чтобы не смешивать core-логику с `.opencode`.
- Датасет `example/swarm-report` содержит operational/security-sensitive сведения, поэтому он не используется как дефолтный scope и подключается только явно через `--folders example/swarm-report`.
- Безопасный дефолт для текущего проекта — `swarm-report`, если папка существует.

## План

1. Создать отдельный TypeScript package `tools/docs-rag`.
2. Разделить код на слои `cli`, `application`, `domain`, `infrastructure`.
3. Добавить команды `init`, `index`, `query`, `status`, где `index/query` пока контролируемые заглушки.
4. Реализовать `init`: создание `.docs-rag/config.json`, запрет перезаписи без `--force`, safe excludes, запрет секретов в config.
5. Добавить `.docs-rag/` и build/runtime артефакты CLI в `.gitignore`.

## Что реализовано

- `tools/docs-rag/package.json`, `package-lock.json`, `tsconfig.json` — отдельный Node/TypeScript package.
- `tools/docs-rag/src/cli/*` — CLI entrypoint, help, парсинг аргументов.
- `tools/docs-rag/src/application/*` — use-cases `initConfig` и `loadConfig`.
- `tools/docs-rag/src/domain/config.ts` — config model, defaults, validation, запрет secret-like ключей.
- `tools/docs-rag/src/infrastructure/fs-config-repository.ts` — filesystem adapter для `.docs-rag/config.json` и `.gitignore`.
- `tools/docs-rag/README.md` — quick start и явное подключение example dataset.
- `.gitignore` — `.docs-rag/`, `tools/docs-rag/node_modules/`, `tools/docs-rag/dist/`.
- `AGENTS.md` — добавлены краткие правила по `docs-rag`.

## Результаты Validation

- `npm install` в `tools/docs-rag` — успешно, уязвимостей не найдено.
- `npm run build` — успешно.
- Smoke CLI:
  - `node dist/cli/index.js --help` — успешно;
  - `node dist/cli/index.js init --project-root ../.. --force` — успешно;
  - `node dist/cli/index.js status --project-root ../..` — успешно;
  - `node dist/cli/index.js index --project-root ../..` — контролируемая заглушка;
  - `node dist/cli/index.js query "..." --project-root ../.. --format json` — контролируемая заглушка.
- Проверена валидация secret-like ключа `openai_api_key` — конфиг отклоняется.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- Первичная версия `query` не принимала опции после текста запроса; исправлено.
- После архитектурного review убрана CLI-семантика exit code из application-ошибок.
- После review изменено поведение `init`: если нет `swarm-report` или `docs`, нужно явно передать `--folders`, а не создавать заведомо пустой дефолт.

## Остаточные риски

- Автотестов и lint script пока нет; validation ограничена build + smoke.
- `index` и `query` остаются заглушками до следующих шагов плана.

## Статус

Done для шагов 1-3.
