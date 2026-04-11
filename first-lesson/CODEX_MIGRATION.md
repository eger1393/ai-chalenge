# Claude Code -> Codex Migration

This repository already contained a local Claude Code setup. The original files were preserved and Codex-native equivalents were added next to them.

## Mapping

| Claude file | Codex adaptation | Notes |
| --- | --- | --- |
| `claude.md` | `AGENTS.md` | Condensed and rewritten for Codex-native repo instructions |
| `.claude/commands/deploy.md` | `.agents/plugins/plugins/first-lesson-local/commands/deploy.md` | Reworked as a Codex plugin command |
| `.claude/commands/interview.md` | `.agents/plugins/plugins/first-lesson-local/commands/interview.md` | Reworked as a Codex plugin command |
| `.claude/settings.local.json` | no 1:1 file | Claude-specific permissions/settings do not map directly to a repo-local Codex config file |
| `.mcp.json` | reused as-is by Codex | Already native enough for Codex MCP discovery |

## What Was Not Migrated 1:1

- `permissions.allow` from `.claude/settings.local.json`: Claude-specific capability allowlist; Codex in this environment uses sandbox/tool policies from the harness instead.
- `enableAllProjectMcpServers` and `enabledMcpjsonServers`: no direct repo-local Codex equivalent was found in the local installation.
- `AskUserQuestion`, strict stage orchestration, and Claude-only subagent references: replaced by Codex-native `AGENTS.md` guidance and command wording.

## Result

- Original Claude files remain untouched.
- Codex now has a native repo instruction file: `AGENTS.md`.
- Codex now has a repo-local plugin marketplace entry with migrated commands under `.agents/plugins/`.
- ВАЖНО: `INSTALLED_BY_DEFAULT` в repo-local `marketplace.json` не гарантирует, что конкретный рантайм Codex автоматически просканирует `.agents/` при старте сессии.
- В текущем окружении Codex `0.120.0` discovery на старте шёл по домашнему plugin-каталогу (`/root/.codex/.tmp/plugins`) и системным skills, а признаков автосканирования repo-local `.agents/plugins/marketplace.json` не обнаружено.
- Поэтому repo-local plugin в этом проекте нужно считать дополнительным локальным источником инструкций, а не гарантированно зарегистрированным built-in skill/plugin.
- Чтобы новая сессия в этом репозитории не игнорировала локальные skills, правило ручного подхвата этих `SKILL.md` закреплено в `AGENTS.md`.
