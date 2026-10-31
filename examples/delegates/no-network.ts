import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface DelegationRequest {
  action: { kind: "command"; command: string } | { kind: "file"; path: string };
}

export default function noNetwork(pi: ExtensionAPI) {
  const delegate = {
    id: "example:no-network",
    name: "no-network",
    decide(request: DelegationRequest) {
      if (request.action.kind !== "command") return undefined;
      if (/\b(curl|wget)\b/.test(request.action.command)) {
        return {
          verdict: "block",
          reason: "network downloads are not allowed here",
        };
      }
      return { verdict: "allow", reason: "no network access" };
    },
  };

  const register = () =>
    pi.events.emit("guardrails:delegate:register", { delegate });
  pi.events.on("guardrails:delegate:request", register);
  register();
}
