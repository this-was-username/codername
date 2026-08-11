import { Command } from "commander";
const program = new Command();

program.option("-p, --port <port>", "server port setting", "80");

program.parse();

console.log(program.opts());