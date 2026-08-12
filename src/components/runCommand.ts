import { spawnSync } from "node:child_process";

export function run(command: string, args: string[], cwd: string) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        shell: true,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}