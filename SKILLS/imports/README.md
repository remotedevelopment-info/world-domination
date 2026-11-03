# SKILLS/imports — imported skill files

This directory holds SKILLS files imported from **outside** this repository, following `SKILLS/SKILLS.md` §6.

## Layout

```
imports/<source>/…        # <source> = repo name, domain, or author; mirrors origin structure
```

## Provenance block (required, top of every imported file)

```markdown
<!-- skill-import
source: <path or URL>
imported: YYYY-MM-DD
note: <why it was imported / license / adaptation status>
-->
```

## Rules

1. Files here are **exempt** from the 7-section contract until graduated.
2. To graduate: refactor to the 7-section format, move the file into the taxonomy
   (record origin in **Result**), delete the provenance block, add a row to the
   master index in `SKILLS/SKILLS.md` §7, then delete the copy from `imports/`.
3. The provenance comment + fixed section headings are machine-parseable, so a
   validator/importer script can be added later without changing any existing file.

_No imported skills yet._
