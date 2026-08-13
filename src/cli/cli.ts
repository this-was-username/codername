import { Command } from "commander";
import path from "node:path";
import * as esbuild from "esbuild";
import { run } from "./components/runCommand.js";
import fs from "node:fs";


const program = new Command();

program
    .name("mycli")
    .description("My build tool");

program
    .command("build")
    .description("Build the current project")
    .action(() => {
        const cwd = process.cwd();
        build(cwd)
    });


async function build(dir: string) {
    const indexTs = path.join(dir, "src/index.ts");


    run("pnpm", ["exec", "tsc"], dir);

    if (!fs.existsSync(indexTs)) {
        console.error(`Entry point not found: ${indexTs}`);
        process.exit(1);
    }

    await esbuild.build({
        entryPoints: [
            indexTs,
        ],
        minify: true,
        bundle: true,
        platform: "node",
        outfile: path.join(dir, "dist/code.js"),
    });
}



program.parse();
