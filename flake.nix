{
  description = "pi-guardrails";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";
    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, git-hooks-nix, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;

      perSystem = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          pre-commit-check = git-hooks-nix.lib.${system}.run {
            src = ./.;
            hooks = {
              biome-check = {
                enable = true;
                name = "biome check";
                entry = "node_modules/.bin/biome check --write";
                files = "\\.(ts|tsx|json)$";
                pass_filenames = false;
              };
              lockfile-check = {
                enable = true;
                name = "lockfile check";
                entry = "${pkgs.pnpm_11}/bin/pnpm install --frozen-lockfile --ignore-scripts";
                files = "(package\\.json|pnpm-lock\\.yaml|pnpm-workspace\\.yaml)$";
                pass_filenames = false;
              };
              typecheck = {
                enable = true;
                name = "typecheck";
                entry = "${pkgs.pnpm_11}/bin/pnpm run typecheck";
                files = "\\.tsx?$";
                pass_filenames = false;
              };
            };
          };
        in
        {
          inherit pre-commit-check;
          devshell = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              pnpm_11
            ];

            shellHook = ''
              ${pre-commit-check.shellHook}
            '';
          };
        }
      );
    in
    {
      devShells = forAllSystems (system: {
        default = perSystem.${system}.devshell;
      });
    };
}
