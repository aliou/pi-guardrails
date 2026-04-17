import { describe, expect, it } from "vitest";
import { BUILTIN_MATCHERS, matchDangerousCommand } from "./dangerous-commands";

/**
 * Helper to run all matchers against a command string.
 * Returns the first match description, or undefined if none match.
 */
function findMatch(words: string[]): string | undefined {
  for (const matcher of BUILTIN_MATCHERS) {
    const result = matcher(words);
    if (result) return result;
  }
  return undefined;
}

describe("rm matcher", () => {
  it("matches rm -rf", () => {
    expect(findMatch(["rm", "-rf", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("matches rm -fr (reversed flags)", () => {
    expect(findMatch(["rm", "-fr", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("matches rm -r -f (separate flags)", () => {
    expect(findMatch(["rm", "-r", "-f", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("matches rm --recursive --force (long options)", () => {
    expect(findMatch(["rm", "--recursive", "--force", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("matches rm --force --recursive (reversed long options)", () => {
    expect(findMatch(["rm", "--force", "--recursive", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("matches rm -Rfv (grouped with extra flags)", () => {
    expect(findMatch(["rm", "-Rfv", "/tmp/test"])).toBe(
      "recursive force delete",
    );
  });

  it("does not match rm -r (no force)", () => {
    expect(findMatch(["rm", "-r", "/tmp/test"])).toBeUndefined();
  });

  it("does not match rm -f (no recursive)", () => {
    expect(findMatch(["rm", "-f", "/tmp/test"])).toBeUndefined();
  });

  it("does not match echo rm -rf", () => {
    expect(findMatch(["echo", "rm", "-rf", "/"])).toBeUndefined();
  });
});

describe("sudo matcher", () => {
  it("matches sudo", () => {
    expect(findMatch(["sudo", "apt", "update"])).toBe("superuser command");
  });

  it("matches sudo at start only", () => {
    expect(findMatch(["echo", "sudo", "something"])).toBeUndefined();
  });
});

describe("doas matcher", () => {
  it("matches doas", () => {
    expect(findMatch(["doas", "pkg_add", "vim"])).toBe(
      "privileged command execution",
    );
  });
});

describe("pkexec matcher", () => {
  it("matches pkexec", () => {
    expect(findMatch(["pkexec", "apt", "install", "firefox"])).toBe(
      "privileged command execution",
    );
  });
});

describe("dd matcher", () => {
  it("matches dd with of= (output file)", () => {
    expect(findMatch(["dd", "if=/dev/zero", "of=/dev/sda"])).toBe(
      "disk write operation",
    );
  });

  it("matches dd with of= in any order", () => {
    expect(findMatch(["dd", "of=/dev/sda", "if=/dev/zero"])).toBe(
      "disk write operation",
    );
  });

  it("matches dd with progress and of=", () => {
    expect(
      findMatch(["dd", "status=progress", "of=/dev/sdb", "if=image.img"]),
    ).toBe("disk write operation");
  });

  it("does not match dd with only if= (input only)", () => {
    expect(findMatch(["dd", "if=/dev/sda", "of=/dev/null"])).toBe(
      "disk write operation",
    );
  });

  it("does not match dd with only if= (read-only)", () => {
    expect(findMatch(["dd", "if=/dev/sda"])).toBeUndefined();
  });
});

describe("mkfs matcher", () => {
  it("matches mkfs.ext4", () => {
    expect(findMatch(["mkfs.ext4", "/dev/sda1"])).toBe("filesystem format");
  });

  it("matches mkfs.xfs", () => {
    expect(findMatch(["mkfs.xfs", "/dev/sdb1"])).toBe("filesystem format");
  });

  it("matches plain mkfs", () => {
    expect(findMatch(["mkfs", "/dev/sda1"])).toBe("filesystem format");
  });

  it("matches mkfs.vfat", () => {
    expect(findMatch(["mkfs.vfat", "/dev/sdc1"])).toBe("filesystem format");
  });
});

describe("shred matcher", () => {
  it("matches shred", () => {
    expect(findMatch(["shred", "-u", "secret.txt"])).toBe(
      "secure file overwrite",
    );
  });
});

describe("wipefs matcher", () => {
  it("matches wipefs", () => {
    expect(findMatch(["wipefs", "-a", "/dev/sda"])).toBe(
      "filesystem signature wipe",
    );
  });
});

describe("blkdiscard matcher", () => {
  it("matches blkdiscard", () => {
    expect(findMatch(["blkdiscard", "/dev/nvme0n1"])).toBe(
      "block device discard",
    );
  });
});

describe("fdisk matcher", () => {
  it("matches fdisk", () => {
    expect(findMatch(["fdisk", "/dev/sda"])).toBe("disk partitioning");
  });

  it("matches sfdisk", () => {
    expect(findMatch(["sfdisk", "/dev/sda"])).toBe("disk partitioning");
  });

  it("matches cfdisk", () => {
    expect(findMatch(["cfdisk", "/dev/sda"])).toBe("disk partitioning");
  });
});

describe("parted matcher", () => {
  it("matches parted", () => {
    expect(findMatch(["parted", "/dev/sda"])).toBe("disk partitioning");
  });

  it("matches sgdisk", () => {
    expect(findMatch(["sgdisk", "-l", "/dev/sda"])).toBe("disk partitioning");
  });
});

describe("chmod matcher", () => {
  it("matches chmod -R 777", () => {
    expect(findMatch(["chmod", "-R", "777", "/tmp"])).toBe(
      "insecure recursive permissions",
    );
  });

  it("matches chmod --recursive 777", () => {
    expect(findMatch(["chmod", "--recursive", "777", "/tmp"])).toBe(
      "insecure recursive permissions",
    );
  });

  it("matches chmod -R 0777", () => {
    expect(findMatch(["chmod", "-R", "0777", "/tmp"])).toBe(
      "insecure recursive permissions",
    );
  });

  it("matches chmod -R a+rwx", () => {
    expect(findMatch(["chmod", "-R", "a+rwx", "/tmp"])).toBe(
      "insecure recursive permissions",
    );
  });

  it("matches chmod -R ugo+rwx", () => {
    expect(findMatch(["chmod", "-R", "ugo+rwx", "/tmp"])).toBe(
      "insecure recursive permissions",
    );
  });

  it("does not match chmod 755 (not world-writable)", () => {
    expect(findMatch(["chmod", "755", "file"])).toBeUndefined();
  });

  it("does not match chmod -R 755 (not world-writable)", () => {
    expect(findMatch(["chmod", "-R", "755", "/tmp"])).toBeUndefined();
  });
});

describe("chown matcher", () => {
  it("matches chown -R", () => {
    expect(findMatch(["chown", "-R", "user:group", "/tmp"])).toBe(
      "recursive ownership change",
    );
  });

  it("matches chown --recursive", () => {
    expect(findMatch(["chown", "--recursive", "user", "/tmp"])).toBe(
      "recursive ownership change",
    );
  });

  it("does not match chown without -R", () => {
    expect(findMatch(["chown", "user:group", "/tmp/file"])).toBeUndefined();
  });
});

describe("container matcher (docker/podman)", () => {
  describe("docker", () => {
    it("matches docker run --privileged", () => {
      expect(findMatch(["docker", "run", "--privileged", "alpine"])).toBe(
        "container with privileged mode",
      );
    });

    it("matches docker run --pid=host", () => {
      expect(findMatch(["docker", "run", "--pid=host", "alpine"])).toBe(
        "container with host PID namespace",
      );
    });

    it("matches docker run --network=host", () => {
      expect(findMatch(["docker", "run", "--network=host", "alpine"])).toBe(
        "container with host network",
      );
    });

    it("matches docker run --userns=host", () => {
      expect(findMatch(["docker", "run", "--userns=host", "alpine"])).toBe(
        "container with host user namespace",
      );
    });

    it("matches docker run with root mount", () => {
      expect(findMatch(["docker", "run", "-v/:/host", "alpine"])).toBe(
        "container with root filesystem mount",
      );
    });

    it("matches docker run with docker socket", () => {
      expect(
        findMatch([
          "docker",
          "run",
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock",
          "alpine",
        ]),
      ).toBe("container with docker socket access");
    });

    it("does not match docker build", () => {
      expect(
        findMatch(["docker", "build", "-t", "myimage", "."]),
      ).toBeUndefined();
    });

    it("does not match docker run without dangerous flags", () => {
      expect(
        findMatch(["docker", "run", "alpine", "echo", "hello"]),
      ).toBeUndefined();
    });
  });

  describe("podman", () => {
    it("matches podman run --privileged", () => {
      expect(findMatch(["podman", "run", "--privileged", "alpine"])).toBe(
        "container with privileged mode",
      );
    });

    it("matches podman create --privileged", () => {
      expect(findMatch(["podman", "create", "--privileged", "alpine"])).toBe(
        "container with privileged mode",
      );
    });
  });
});

describe("matchDangerousCommand", () => {
  it("returns description and pattern for dangerous commands", () => {
    const result = matchDangerousCommand(["sudo", "apt", "update"]);
    expect(result).toEqual({
      description: "superuser command",
      pattern: "sudo",
    });
  });

  it("returns undefined for safe commands", () => {
    expect(matchDangerousCommand(["echo", "hello"])).toBeUndefined();
  });

  it("returns first match when multiple could apply", () => {
    // sudo comes before dd in the matcher list
    const result = matchDangerousCommand(["sudo", "dd", "of=/dev/sda"]);
    expect(result?.pattern).toBe("sudo");
  });
});
