---
"@aliou/pi-guardrails": patch
---

Remote command argv no longer reads as local filesystem access. Path extraction drops ssh argv entirely — nothing in it is reliably a local path (`-i` identity files stay unprompted as a consequence) — and drops the kubectl tail after `--`, which kubectl passes to the container command per its CLI contract. `ssh user@host 'cat /etc/passwd'` and `kubectl exec -it pod/one -- ls /app` no longer prompt for `/etc/passwd` or `/app` as local paths.
