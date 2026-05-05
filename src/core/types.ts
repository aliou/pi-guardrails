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

export type Safety =
  | {
      kind: "safe";
    }
  | {
      kind: "dangerous";
      action: Action;
      reason: string;
      key: string;
    };

export type PermissionState = "granted" | "prompt" | "denied";

export type Grant = "once" | "always" | "never";

export type Decision =
  | {
      kind: "allow";
    }
  | {
      kind: "deny";
      reason: string;
    }
  | {
      kind: "prompt";
      risk: Safety & { kind: "dangerous" };
    };
