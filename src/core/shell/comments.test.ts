import { describe, expect, it } from "vitest";
import { stripBashComments } from "./comments";

describe("stripBashComments", () => {
  it("strips trailing comments", () => {
    expect(stripBashComments("cat /etc/hosts # note")).toBe("cat /etc/hosts ");
  });

  it("strips whole comment lines while keeping line structure", () => {
    expect(stripBashComments("# setup\ncat /etc/hosts")).toBe(
      "\ncat /etc/hosts",
    );
  });

  it("keeps the newline a trailing comment swallows", () => {
    expect(stripBashComments("cat /etc/hosts # note\ncat /etc/passwd")).toBe(
      "cat /etc/hosts \ncat /etc/passwd",
    );
  });

  it("keeps # inside quotes", () => {
    expect(stripBashComments(`echo "a # b" 'c # d'`)).toBe(
      `echo "a # b" 'c # d'`,
    );
  });

  it("keeps escaped hash marks", () => {
    expect(stripBashComments("echo \\#nothere")).toBe("echo \\#nothere");
  });

  it("keeps hash marks that do not start a word", () => {
    expect(stripBashComments("echo foo#bar")).toBe("echo foo#bar");
    expect(stripBashComments('echo "\x24{x#pat}"')).toBe('echo "\x24{x#pat}"');
  });

  it("treats apostrophes inside a comment as comment text", () => {
    // Issue #105: `# don't forget` used to pair quotes across the comment.
    expect(stripBashComments("echo done # don't forget /x")).toBe("echo done ");
  });

  it("strips comments after command separators", () => {
    expect(stripBashComments("cd /x && # note\ncd /y")).toBe(
      "cd /x && \ncd /y",
    );
  });

  it("discards the final line when it is a comment", () => {
    expect(stripBashComments("cd /x\n# all gone")).toBe("cd /x\n");
  });
});
