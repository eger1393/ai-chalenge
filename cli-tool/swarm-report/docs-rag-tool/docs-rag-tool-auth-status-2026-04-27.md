# docs-rag: безопасная проверка OpenAI API key

Дата: 2026-04-27

## Краткое описание задачи

Сделать настройку `OPENAI_API_KEY` удобнее, не сохраняя секрет в локальный config-файл.

## Итоги Research

- Хранить API key в `.docs-rag/config.json` небезопасно: высокий риск случайного попадания секрета в git, отчёты или логи.
- Безопасная альтернатива — проверять наличие ключа в окружении и давать пользователю понятную инструкцию по `export`.

## План

1. Добавить CLI-подкоманду `docs-rag auth status`.
2. Не записывать и не выводить значение ключа.
3. Обновить help и README.
4. Проверить поведение с ключом и без ключа.

## Что реализовано

- `src/cli/args.ts` — добавлен parsing двухсловной команды `auth status`.
- `src/cli/index.ts` — добавлен handler `auth-status`.
- `src/cli/help.ts` — обновлена справка.
- `README.md` — добавлена инструкция по проверке и настройке env.

## Результаты Validation

- `npm run build` — успешно.
- `node dist/cli/index.js auth status` без ключа — показывает `OPENAI_API_KEY: missing` и инструкцию `export`.
- `OPENAI_API_KEY="test-secret-value" node dist/cli/index.js auth status` — показывает `OPENAI_API_KEY: configured`, значение ключа не выводится.
- `node dist/cli/index.js --help` — новая команда отображается.
- `git diff --check` по изменённым путям — без замечаний.

## Проблемы и откаты

- От идеи сохранять ключ в local config отказались как от небезопасной.

## Статус

Done.
