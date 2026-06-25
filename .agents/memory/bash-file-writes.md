---
name: bash file writes
description: edit tool occasionally fails to persist changes to disk; use bash for reliable writes
---

## Rule
When `edit` or `write` tool reports success but subsequent `grep` or `read` shows the content is missing, switch to bash `python3` inline script or `cat >> file` approach for that file.

**Why:** In some sessions, the edit/write tools report success in their output but the underlying file on disk is not modified. Bash commands (`cat`, `python3` with open/write) write directly to disk and are more reliable.

**How to apply:**
- After any critical edit, verify with `grep -c "pattern" file` to confirm content was written
- If edit fails silently: use `python3 - << 'PYEOF' ... PYEOF` with `open().write()` 
- For append-only: use `cat >> file << 'EOF' ... EOF`
- Always check exit code (`$?`) after the bash command
