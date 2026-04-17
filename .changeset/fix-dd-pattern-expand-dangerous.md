---
"@aliou/pi-guardrails": minor
---

Fix dd pattern (if= to of=) and expand dangerous command detection

Fixed the dd pattern to check for of= (output file) instead of if= (input file),
as of= is the actual dangerous write operation. Also extracted dangerous command
matchers to a separate module and added new patterns for:

- Privilege escalation: doas, pkexec
- Secure destruction: shred, wipefs, blkdiscard  
- Disk partitioning: fdisk, sfdisk, cfdisk, parted, sgdisk
- Container escapes: docker/podman run with --privileged, --pid=host,
  --network=host, --userns=host, root mounts, docker socket mounts

Improved existing matchers to handle long options like --recursive,
--force, etc.

Fixes #22
