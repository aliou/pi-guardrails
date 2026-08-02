export type Action =
  | {
      kind: "file";
      path: string;
      origin?: string;
      /**
       * True when the path still contains an unexpanded shell expansion (e.g.
       * `$VAR`, `$(...)`). Such paths can't be stat()'d reliably, so existence
       * checks must not use them to suppress a match.
       */
      unresolved?: boolean;
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
