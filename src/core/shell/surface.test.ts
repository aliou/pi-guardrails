import { describe, expect, it } from "vitest";
import { commandSurfaces } from "./surface";

describe("commandSurfaces", () => {
  it("drops fully quoted data words from the surface", () => {
    expect(commandSurfaces("grep -c 'bandW \\* 2 / 3' content04.js")).toEqual([
      "grep -c content04.js",
    ]);
  });

  it("keeps unquoted path operands, including a root scan", () => {
    expect(commandSurfaces("grep -rn foo /")).toEqual(["grep -rn foo /"]);
    expect(commandSurfaces("grep -rn foo ~")).toEqual(["grep -rn foo ~"]);
  });

  it("keeps unquoted data words (raw text stays visible)", () => {
    expect(commandSurfaces("grep -rn /transition tests")).toEqual([
      "grep -rn /transition tests",
    ]);
  });

  it("drops sed and awk program text when quoted", () => {
    expect(commandSurfaces("sed -i 's/a * 2 \\/ 3/b/' file.js")).toEqual([
      "sed -i file.js",
    ]);
    expect(commandSurfaces("awk '{print $1}' /etc/passwd")).toEqual([
      "awk /etc/passwd",
    ]);
  });

  it("keeps flags and expression words so flag patterns still match", () => {
    expect(commandSurfaces("find / -name 'x' -delete")).toEqual([
      "find / -name -delete",
    ]);
    expect(commandSurfaces("rm -rf ./scratch")).toEqual(["rm -rf ./scratch"]);
  });

  it("keeps interpreter code so content patterns still match", () => {
    expect(commandSurfaces("node -e 'fs.readFile(\"/etc/passwd\")'")).toEqual([
      'node -e fs.readFile("/etc/passwd")',
    ]);
  });

  it("gives substituted commands their own surface", () => {
    expect(commandSurfaces('echo "$(cat .env)"')).toEqual([
      "echo $(...)",
      "cat .env",
    ]);
  });

  it("keeps shell program text so content patterns still match", () => {
    expect(commandSurfaces("bash -c 'rm -rf /'")).toEqual(["bash -c rm -rf /"]);
  });

  it("returns one surface per pipeline command", () => {
    expect(commandSurfaces("ls | rm -rf x")).toEqual(["ls", "rm -rf x"]);
  });

  it("returns null when the command does not parse", () => {
    expect(commandSurfaces("echo 'unclosed")).toBeNull();
  });

  it("drops quoted option values and remote commands", () => {
    expect(commandSurfaces("cut -d '/' -f2")).toEqual(["cut -d -f2"]);
    expect(commandSurfaces("ssh host 'cat /etc/passwd'")).toEqual(["ssh host"]);
    expect(commandSurfaces("ssh host rm -rf /")).toEqual(["ssh host rm -rf /"]);
  });
});
