import { PlayerId } from "../../lib/api.js";

// id と cmd を除いた「実際の引数」の型
type Args<F extends (...a: any[]) => any> =
    F extends (id: PlayerId, cmd: string, ...args: infer R) => any ? R : never;

export const command = <
    const N extends number | null,
    F extends (id: PlayerId, cmd: string, ...args: string[]) => void
>(
    id: PlayerId,
    input: string,
    cmd: string,
    argsLength: N & (
        N extends number
        ? (Args<F>["length"] extends N ? unknown : never)
        : unknown
    ),
    func: F
) => {
    const argv = input.split(" ");
    if (argv[0] !== cmd) return;

    if (argsLength !== null && argv.length - 1 !== argsLength) {
        console.error("Invalid argument count");
        return;
    }

    func(id, cmd, ...argv.slice(1));
};