---
name: init-deep
description: Generate or refresh hierarchical AGENTS.md files for a repository, including the root file and complexity-scored subdirectory files. Use when Codex needs to analyze project structure, decide where nested AGENTS.md files belong, preserve useful existing guidance, and create or rebuild the hierarchy in update or create-new mode.
---

# Init Deep

Generate hierarchical AGENTS.md files. Root + complexity-scored subdirectories.

## Invocation Examples

```text
$init-deep                      # Update mode: modify existing + create new where warranted
$init-deep --create-new         # Read existing -> remove all -> regenerate from scratch
$init-deep --max-depth=2        # Limit directory depth (default: 3)
```

## Workflow

1. Discovery + analysis
2. Scoring and location decision
3. Generate root and child files
4. Review, deduplicate, validate

## Critical Rule

Use `update_plan` for all phases. Move each phase from `pending` to `in_progress` to `completed` in real time.

Suggested plan shape:

```json
{
  "plan": [
    {
      "step": "Fire explore pass + codemap + read existing AGENTS.md",
      "status": "pending"
    },
    {
      "step": "Score directories and determine AGENTS.md locations",
      "status": "pending"
    },
    {
      "step": "Generate AGENTS.md files for root and subdirectories",
      "status": "pending"
    },
    {
      "step": "Deduplicate, validate, and trim generated files",
      "status": "pending"
    }
  ]
}
```

## Phase 1: Discovery + Analysis

Mark discovery as `in_progress`.

### Parallel Discovery

- If the active environment explicitly allows delegation or the user asked for parallel agent work, spawn explorer agents immediately for:
  - standard patterns vs. deviations
  - entry points and non-standard organization
  - config-driven conventions
  - forbidden patterns such as `DO NOT`, `NEVER`, `ALWAYS`, `DEPRECATED`
  - build and CI conventions
  - test layout and test-specific rules
- If delegation is not allowed, run the same passes locally with `rg`, `fd`, `tree`, `ast-grep`, and targeted file reads

### Dynamic Agent Spawning

Only when delegation is allowed, scale additional explorer agents by project size.

| Factor | Threshold | Additional Agents |
|-|-|-|
| Total files | >100 | +1 per 100 files |
| Total lines | >10k | +1 per 10k lines |
| Directory depth | >=4 | +2 for deep exploration |
| Large files (>500 lines) | >10 files | +1 for complexity hotspots |
| Monorepo | detected | +1 per package or workspace |
| Multiple languages | >1 | +1 per language |

Measure project scale first:

```bash
total_files=$(find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l)
total_lines=$(find . -type f \( -name "*.ts" -o -name "*.py" -o -name "*.go" \) -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
large_files=$(find . -type f \( -name "*.ts" -o -name "*.py" \) -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | awk '$1 > 500 {count++} END {print count+0}')
max_depth=$(find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | awk -F/ '{print NF}' | sort -rn | head -1)
```

Useful extra discovery passes:

- Large file analysis: find complexity hotspots
- Deep module analysis: inspect patterns at depth 4+
- Cross-cutting concerns: find shared utilities and global contracts
- Package-level analysis for monorepos
- Language-specific analysis for each detected language

### Main Session Analysis

While background work runs, inspect the repository directly.

#### 1. Structural Analysis

```bash
# Directory depth distribution
find . -type d -not -path '*/.*' -not -path '*/node_modules/*' -not -path '*/venv/*' -not -path '*/dist/*' -not -path '*/build/*' | awk -F/ '{print NF-1}' | sort -n | uniq -c

# Files per directory (top 30)
find . -type f -not -path '*/.*' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -30

# Code concentration by extension
find . -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.go" -o -name "*.rs" \) -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Existing AGENTS.md / CLAUDE.md
find . -type f \( -name "AGENTS.md" -o -name "CLAUDE.md" \) -not -path '*/node_modules/*' 2>/dev/null
```

#### 2. Read Existing Guidance

- Read every existing `AGENTS.md` and `CLAUDE.md`
- Extract key conventions, anti-patterns, contracts, and directory-specific rules
- In `--create-new` mode, read everything first, then delete, then regenerate

#### 3. Codemap / Symbol Pass

- If LSP or symbol tools are available in the current environment, use them for document symbols, workspace symbols, and reference centrality
- If those tools are unavailable, approximate the codemap with `ast-grep`, `rg`, entry-point inspection, and export counts from source files
- Prefer entry points first: `src/index.ts`, `src/main.ts`, `main.py`, `cmd/*`, `app/*`, `package.json`, `pyproject.toml`, `go.mod`

### Merge Findings

- Merge bash, symbol, existing-guidance, and explorer results
- Mark discovery as `completed`

## Phase 2: Scoring & Location Decision

Mark scoring as `in_progress`.

### Scoring Matrix

| Factor | Weight | High Threshold | Source |
|-|-|-|-|
| File count | 3x | >20 | bash |
| Subdir count | 2x | >5 | bash |
| Code ratio | 2x | >70% | bash |
| Unique patterns | 1x | Has own config | discovery |
| Module boundary | 2x | Has `index.ts` or `__init__.py` | bash |
| Symbol density | 2x | >30 symbols | LSP or fallback codemap |
| Export count | 2x | >10 exports | LSP or fallback codemap |
| Reference centrality | 3x | >20 refs | LSP or fallback codemap |

### Decision Rules

| Score | Action |
|-|-|
| Root (`.`) | Always create |
| >15 | Create AGENTS.md |
| 8-15 | Create only if the directory is a distinct domain |
| <8 | Skip and let the parent file cover it |

### Output Shape

```text
AGENTS_LOCATIONS = [
  { path: ".", type: "root" },
  { path: "src/hooks", score: 18, reason: "high complexity" },
  { path: "src/api", score: 12, reason: "distinct domain" }
]
```

Mark scoring as `completed`.

## Phase 3: Generate AGENTS.md

Mark generate as `in_progress`.

### Root AGENTS.md

Use a full root document with only repository-specific information.

~~~~markdown
# PROJECT KNOWLEDGE BASE

**Generated:** {TIMESTAMP}
**Commit:** {SHORT_SHA}
**Branch:** {BRANCH}

## OVERVIEW
{1-2 sentences: what + core stack}

## STRUCTURE
{root}/
|- {dir}/    # {non-obvious purpose only}
|- {entry}

## WHERE TO LOOK
| Task | Location | Notes |
|-|-|-|

## CODE MAP
{From LSP or fallback codemap - skip if the project is tiny}

| Symbol | Type | Location | Refs | Role |
|-|-|-|-|-|

## CONVENTIONS
{Only deviations from standard patterns}

## ANTI-PATTERNS
{Project-specific forbidden patterns}

## UNIQUE STYLES
{Project-specific expectations}

## COMMANDS
{dev/test/build}

## NOTES
{Gotchas}
~~~~

Quality gates for the root file:

- 50-150 lines
- No generic advice
- No obvious information
- No repeated content from existing root guidance unless it is the source of truth

### Subdirectory AGENTS.md

- Generate each child file from parent-aware context
- If delegation is allowed, parallelize child drafting with agents
- If delegation is not allowed, generate sequentially but apply the same constraints
- Never repeat parent guidance verbatim
- Keep each child file between 30 and 80 lines
- Use sections such as `OVERVIEW`, `STRUCTURE`, `WHERE TO LOOK`, `CONVENTIONS`, `ANTI-PATTERNS` only when each section adds local value

Mark generate as `completed`.

## Phase 4: Review & Deduplicate

Mark review as `in_progress`.

For each generated file:

- Remove generic advice
- Remove text duplicated from parent files
- Trim to the size limit
- Keep the style telegraphic and dense
- Verify every referenced path or command exists
- Verify child files explain only local contracts

Mark review as `completed`.

## Final Report

```text
=== init-deep Complete ===

Mode: {update | create-new}

Files:
  [OK] ./AGENTS.md
  [OK] ./src/hooks/AGENTS.md

Dirs Analyzed: {N}
AGENTS.md Created: {N}
AGENTS.md Updated: {N}

Hierarchy:
  ./AGENTS.md
  └── ./src/hooks/AGENTS.md
```

## Anti-Patterns

- Static agent count
- Sequential execution when safe parallel work is available
- Ignoring existing guidance before regeneration
- Creating AGENTS.md in every directory without scoring
- Repeating parent guidance in child files
- Leaving generic content that could apply to any repository
- Hallucinating symbol data when LSP is unavailable
- Forcing delegation when the active environment forbids it
