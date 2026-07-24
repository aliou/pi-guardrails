import type { DeepMocked } from "@golevelup/ts-vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  expect,
  type Matcher,
  type MatcherState,
} from "vitest";

declare global {
  namespace Chai {
    interface Assertion {
      toHaveEmitted(channel: string, payload: unknown): void;
    }
  }
}

const toHaveEmitted: Matcher<
  MatcherState,
  [channel: string, expectedPayload: unknown]
> = function (received, channel, expectedPayload) {
  const pi = received as DeepMocked<ExtensionAPI>;
  const emitted = pi.events.emit.mock.calls.filter(
    ([emittedChannel]) => emittedChannel === channel,
  );
  const pass = emitted.some(([, payload]) =>
    this.equals(payload, expectedPayload),
  );

  return {
    pass,
    actual: emitted.map(([, payload]) => payload),
    expected: expectedPayload,
    message: () =>
      `expected Pi ${this.isNot ? "not " : ""}to have emitted ${this.utils.printExpected(channel)} with ${this.utils.printExpected(expectedPayload)}`,
  };
};

expect.extend({ toHaveEmitted });
