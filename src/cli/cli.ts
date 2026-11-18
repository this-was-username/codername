import { Command } from "commander";
import { build } from "../build.js";
import fs from "node:fs/promises";

const program = new Command();

program
    .name("mycli")
    .description("My build tool");

program
    .command("build")
    .description("Build the current project")
    .option('-h, --hide-code', 'Hide the code with lobbyDbValues')
    .action(async (options) => {
        const cwd = process.cwd();
        const isHideCode = !!options.hideCode;

        if (isHideCode) {
            const result = await build(cwd, true);
            await fs.writeFile('dist/worldCode.js', result.worldCode);
            await fs.writeFile('dist/codeBlock.js', result.codeBlock);
        } else {
            const result = await build(cwd, false);
            await fs.writeFile('dist/worldCode.js', result);
        }
        console.log("Done")
    });






program.parse();
