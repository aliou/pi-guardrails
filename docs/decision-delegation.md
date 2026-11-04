# Decision delegation

How permission-gate and path-access let other extensions decide an action
before prompting the user, or answer the prompt while it is open, and how to
write such a delegate.

## Flow

Delegation sits between the deterministic checks and the confirmation prompt.
Only actions that would prompt reach delegates.

```text
permission-gate / path-access  tool_call
├─ session grants, auto-deny, policies, safe checks   unchanged; delegates never see these
├─ nothing would prompt                               unchanged; no delegation
│    (requireConfirmation off, pathAccess "block", print/JSON mode)
├─ delegateDecision()                                 src/shared/delegation/dispatch.ts
│  ├─ roster.list(): enabled delegates (none → prompt as usual)
│  ├─ runDelegates(): all in parallel, shared deadline (delegation.timeoutMs)
│  │                  the first block cancels the rest
│  ├─ combineDelegateOutcomes()                       src/core/delegation.ts
│  ├─ pi.appendEntry("guardrails:decision")           session entry, not sent to the model
│  └─ emit guardrails:decision:delegated
├─ allow → the tool runs, no prompt
├─ block → { block: true }, guardrails:action:blocked with block.source "delegate"
└─ ask   → the usual prompt (RPC uses its select dialog)
   └─ racePrompt()                                    src/shared/delegation/respond.ts
      ├─ the local prompt opens, as before
      ├─ every enabled delegate with respond() is asked at the same time
      ├─ the first answer wins: the user, a responder, or the prompt timeout
      └─ the rest are dismissed (local prompt) or aborted (context.signal)
```

Merge rule:

| outcomes | result |
|---|---|
| any delegate blocks | blocked |
| every delegate allows | runs without a prompt |
| anything else: an ask, a timeout, an error, an abstention | the usual prompt |

Delegates get `delegation.timeoutMs` to answer (default 10s, capped at 60s).

When one path-access tool call touches several outside paths, each path is
a separate decision, and all of them are delegated at once. Any block blocks
the tool call. Paths that are not allowed are then prompted one at a time.

## Writing a delegate

A delegate is a plain Pi extension. It does not import this package; it
registers an object on the event bus:

```ts
const delegate = {
  id: "example:no-network",          // stable; re-registering replaces it
  name: "no-network",                // shown in the session entry
  isEnabled: () => true,             // optional runtime switch
  decide(request, context) {
    return { verdict: "block", reason: "network downloads are not allowed here" };
  },
};
const register = () => pi.events.emit("guardrails:delegate:register", { delegate });
pi.events.on("guardrails:delegate:request", register);  // features loaded later ask again
register();                                             // features loaded earlier
```

Runnable examples:

- `examples/delegates/no-network.ts`: synchronous rules that block, allow, or abstain.
- `examples/delegates/slow-review.ts`: async work that honors `context.signal`.
- `examples/delegates/classifier.ts`: a delegate backed by Pi classifier models.
- `examples/delegates/remote-approval.ts`: answers open prompts from outside the terminal.

Load one with `pi -e examples/delegates/no-network.ts`.

A delegate implements `decide`, `respond`, or both.

### `decide(request, context)`

Return `{ verdict: "allow" | "block" | "ask", reason }`, a promise of it, or
`undefined` to abstain. Abstaining, throwing, or returning a malformed answer
all escalate to the prompt. The `reason` is shown to the user, and to the agent
when the action is blocked.

`request` describes the flagged action:

| field | example |
|---|---|
| `feature` | `"permissionGate"`, `"pathAccess"` |
| `action` | `{ kind: "command", command }` or `{ kind: "file", path }` |
| `reason` | why it was flagged, e.g. `"recursive force delete"` |
| `metadata` | the feature's risk metadata |
| `toolName` | `"bash"`, `"read"`, … |
| `input` | the raw tool input |

`context` is a slice of Pi's extension context:

| field | use |
|---|---|
| `cwd` | session working directory |
| `signal` | aborts on timeout, agent abort, or once another delegate blocked; stop work when it fires |
| `sessionManager` | read-only session: `buildSessionProjection()` for what the model sees, `getBranch()` / `getEntries()` for the full history |
| `modelRegistry` | Pi models, e.g. `getModelOfType("classifier", …)` and `classify()` |

A delegate cannot prompt the user through this contract; it returns `ask`
instead. It is still ordinary extension code and can use its own `pi` API.

### `respond(request, context)`

Answers a prompt while it is open, for example by asking a person somewhere
else: a chat channel, a phone, another machine. `decide` runs within
`delegation.timeoutMs` before any prompt; `respond` has no deadline of its own
and races the local prompt for as long as it stays open.

```ts
const delegate = {
  id: "example:remote-approval",
  name: "remote-approval",
  async respond(request, context) {
    // post request.action and request.promptId somewhere, then wait for a
    // reply bound to that prompt ID; stop when context.signal aborts
    return { choice: "allow", reason: "approved in #ops" };
  },
};
```

Return `{ choice, reason }`, a promise of it, or `undefined` to leave the
prompt to the user. Throwing, abstaining, or a choice outside
`request.choices` leaves the prompt open. The first answer wins:

| first answer | result |
|---|---|
| the local user | as before; responders are aborted |
| a responder, `allow` | the action runs once; no grant is saved |
| a responder, `deny` | blocked, `guardrails:action:blocked` with block.source `"responder"` |
| the prompt timeout | blocked, block.source `"timeout"` |

`request` is the `decide` request plus:

| field | example |
|---|---|
| `promptId` | the same ID as the `guardrails:prompt:opened` event |
| `choices` | the answers this prompt accepts: `["allow", "deny"]` |

`request.action` is the exact action that runs if allowed: the full command,
or the resolved absolute path. When one path-access call prompts for several
paths, each path is its own prompt with its own `promptId`.

`context` is the same as for `decide`. Its `signal` aborts once the prompt
closes, whoever answered; stop waiting and clean up when it fires.

While responders are registered, the prompt footer names them:
`Also waiting on remote-approval; the first answer wins.`

Runnable example: `examples/delegates/remote-approval.ts` writes each open
prompt to `$GUARDRAILS_APPROVAL_DIR/<promptId>.json` (default under the
system temp directory) and answers it once `allow` or `deny` is written to
`<promptId>.answer`.

### Prompt timeouts

```json
{
  "permissionGate": { "promptTimeoutMs": 300000 },
  "pathAccess": { "promptTimeoutMs": 300000 }
}
```

A prompt nobody answers within `promptTimeoutMs` is denied, and the agent is
told why. The default, `0`, waits forever as before. The timeout covers the
whole prompt, including the time responders spend waiting.

## What the user sees

- While delegates decide, one line above the editor:
  `[guardrails] ⠋ deciding rm -rf build/cache · 1/3 answered · 2.6s left`,
  or `[guardrails] ⠋ 2 decisions in progress · 1.4s left` when several tool
  calls are waiting.
- Under the tool call, one session entry per decision:

  ```text
  [guardrails] ✓ allowed: no-network, slow-review · 1.5s
  [guardrails] ? escalated: slow-review timed out · 10.0s
  [guardrails] ✗ blocked: no-network: network downloads are not allowed here · 1ms
  ```

  Expanding it (the tool expand key, or a click) adds the flagged reason and
  one line per delegate with its verdict, reason, and time.

## Events

| event | payload |
|---|---|
| `guardrails:delegate:request` | emitted by each feature on load |
| `guardrails:delegate:register` | `{ delegate }`, emitted by a delegate |
| `guardrails:decision:delegated` | the merged decision with every delegate's outcome |

Types: `src/shared/delegation/types.ts`.

## Model-backed delegates

A delegate can call Pi classifier models through `context.modelRegistry`
(`getModelOfType("classifier", …)` + `classify()`).
`examples/delegates/classifier.ts` is a full example: for each flagged action
it asks the model three questions (enough context? in scope of the user's
request? impact 0–4?) and maps the answers to a verdict. Copy it into your
own extensions and tune its models, rubric, and thresholds there.
