export type Action =
  | {
      kind: "file";
      path: string;
      origin?: string;
    }
  | {
      kind: "command";
      command: string;
      origin?: string;
    };

export type RuleResult<TMeta = null> =
  | {
      kind: "pass";
    }
  | {
      kind: "match";
      reason: string;
      metadata: TMeta;
    };

export type Safety<TMeta = null> =
  | {
      kind: "safe";
    }
  | {
      kind: "dangerous";
      action: Action;
      key: string;
      reason: string;
      metadata: TMeta;
    };

export type Rule<TMeta = null> = {
  key: string;
  check: (action: Action) => RuleResult<TMeta> | Promise<RuleResult<TMeta>>;
};

export type PermissionState = "granted" | "prompt" | "denied";

export type Grant = "once" | "always" | "never";

export type Decision<TMeta = null> =
  | {
      kind: "allow";
    }
  | {
      kind: "deny";
      reason: string;
    }
  | {
      kind: "prompt";
      risk: Safety<TMeta> & { kind: "dangerous" };
    };
