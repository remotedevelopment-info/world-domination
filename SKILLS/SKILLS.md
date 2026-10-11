# SKILLS — Format Model & Index

> Model: 1.0.0 · This root file is the **model**, not a skill; it intentionally does not use the 7-section skill format. Every other `SKILLS.md` in this tree must follow it (see `_template/SKILLS.md`).

## 1. What is a SKILL

A SKILL is a living design document for one concern of the Kingdom Conquest project. It is grounded in the actual codebase (with file/line references), records what exists today in **Result**, and what is risky or missing in **Concerns**/**Issues**. SKILLS are documentation only — they never modify code.

## 2. Directory taxonomy

```
SKILLS/
├── SKILLS.md                  # This model + master index
├── _template/SKILLS.md        # Copy-this skeleton for new skills
├── imports/<source>/…         # Imported SKILLS files (see §6)
└── <major-concern>/           # Top-level subdirectory = major concern
    ├── SKILLS.md              # The major concern (required)
    └── <specific-concern>/    # Sub-subdirectory = specific concern
        └── SKILLS.md          # The specific concern (required)
```

Rules:
1. Every directory in the taxonomy (except `_template` and `imports`) contains a `SKILLS.md`.
2. Top-level directories are **major concerns**; their subdirectories are **specific concerns**. Nesting is capped at two levels below the top. If a concern needs a third level, promote or restructure — a skill that deep is really two skills.
3. A parent skill's **Result** should link to its sub-skills; concerns that belong to a sub-skill are not repeated in the parent.

## 3. Skill file format (the contract)

Each `SKILLS.md` is structured exactly as follows:

1. **H1 title**: the skill's path relative to `SKILLS/` (e.g. `# borders/rendering`).
2. **Status line** immediately after: `> Model: <model version> · Status: draft|active|deprecated`
   - `draft` = written but not yet implemented/maintained · `active` = matches reality, maintained · `deprecated` = superseded (name the replacement).
3. **Exactly seven H2 sections, in this fixed order**:

| # | Section | Definition |
|---|---------|------------|
| 1 | `## Purpose` | 2–4 sentences: what this concern is and why it exists. |
| 2 | `## Affects` | Exactly one line: `Backend`, `Frontend`, or `Both`. |
| 3 | `## Released/Intended SEMVER` | Two bullets: `**Released:**` (last shipped version, or `—`) and `**Intended:**` (next target), plus optional bump notes. Rules in §4. |
| 4 | `## Ideas` | Future directions and candidates for further sub-skills. |
| 5 | `## Concerns` | Open design questions and risks — things not yet decided or inherently tricky. |
| 6 | `## Issues` | Known defects in the current code, each with a file/line reference. Never speculate: verify against the code. |
| 7 | `## Result` | What is actually implemented and working today, with file references. Link to sub-skills. |

**Stable parse points** (guaranteed by this model so future tooling can rely on them):
- H1 = skill path; the blockquote line = model version + status.
- The seven H2 headings, spelled exactly as above, in order.
- Affects body = one token on its own line; SEMVER bullets begin `**Released:**` and `**Intended:**`.

## 4. Skill SEMVER rules

- Every skill starts at `Released: —` / `Intended: 0.1.0`.
- **Released** bumps when the concern's shipped behavior or contract changes:
  - **patch** — clarification, doc-only, no behavior change
  - **minor** — additive capability (new endpoint, new message type)
  - **major** — breaking contract change (envelope format, endpoint removal, schema break)
- **Intended** is always the next target version; when work ships, move it into **Released** and raise **Intended** again.
- Sub-skill versions are independent of their parent's.


## 5. Model evolution rules

The format itself evolves under the same discipline:

| Change | Model bump |
|---|---|
| Add/remove/rename a required section, or change the taxonomy | **major** — all skills must migrate; note migration in the changelog |
| Add an optional section, optional field, or new stable parse point | **minor** |
| Clarification / wording | **patch** |

Each skill's status line records the model version it conforms to.

**Model changelog**
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-10 | Initial model: 7 sections, 2-level taxonomy, copied-in imports. |

## 6. Importing SKILLS files

External SKILLS files (from other projects, templates, or teammates) are brought in **copied-in with provenance**:

1. Place them under `SKILLS/imports/<source>/…` mirroring their origin structure (`<source>` = repo name, domain, or author).
2. Prefix each imported file with a provenance comment:
   ```markdown
   <!-- skill-import
   source: <path or URL>
   imported: YYYY-MM-DD
   note: <why it was imported / license / adaptation status>
   -->
   ```
3. Imported files are **exempt** from the 7-section contract while they sit in `imports/`.
4. To *graduate* an imported skill into the taxonomy: refactor it to the 7-section format, drop the provenance block (record origin in **Result**), move it to its concern directory, and add it to the index below.
5. The provenance comment and stable parse points (§3) are chosen so a validator/importer script can be added later **without changing any existing file**.

## 7. Master index

| Path | Concern | Affects | Status | Released | Intended |
|------|---------|---------|--------|----------|----------|
| `socket-communications` | Real-time server↔client transport | Both | draft | — | 0.1.0 |
| `socket-communications/protocol` | WebSocket message contract | Both | draft | — | 0.1.0 |
| `socket-communications/reconnection-heartbeat` | Link recovery & liveness | Both | draft | — | 0.1.0 |
| `server-architecture` | Go service structure | Backend | draft | — | 0.1.0 |
| `server-architecture/game-engine` | 90-second tick engine | Backend | draft | — | 0.1.0 |
| `server-architecture/database` | Schema & persistence | Backend | draft | — | 0.1.0 |
| `server-architecture/http-api` | REST endpoints & auth middleware | Backend | draft | — | 0.1.0 |
| `javascript-frontend-structure` | Vanilla JS client organization | Frontend | draft | — | 0.1.0 |
| `world-map` | Map representation & rendering | Both | draft | — | 0.1.0 |
| `world-map/projection` | Coordinate math (normalized → canvas) | Both | draft | — | 0.1.0 |
| `world-map/kingdom-data` | Geometry vs. attribute sources of truth | Both | draft | — | 0.1.0 |
| `borders` | Ownership boundaries: visuals & rules | Both | draft | — | 0.1.0 |
| `borders/rendering` | Border strokes & click hit-testing | Both | draft | — | 0.1.0 |
| `borders/expansion` | Territory gain/loss mechanics | Both | draft | — | 0.1.0 |

*(No imported skills yet.)*

## 8. Validation checklist

- [ ] Path H1, status line with model version present
- [ ] Exactly the 7 required H2 sections, spelled and ordered per §3
- [ ] Affects is a single valid token
- [ ] SEMVER bullets present (`**Released:**`, `**Intended:**`)
- [ ] Every claim in **Issues**/**Result** verified against code
- [ ] Row added to the master index (§7)
