import { PlayerId } from "../../lib/api.js";

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never;

export const command = <
    const N extends number,
    F extends (id: PlayerId, cmd: string, ...args: string[]) => void
>(
    id: PlayerId,
    input: string,
    cmd: string,
    argsLength: N & (Tail<Parameters<F>>["length"] extends N ? unknown : never),
    func: F
) => {
    const argv = input.split(" ");
    if (argv[0] !== cmd) return;

    if (argv.length - 1 !== argsLength) {
        console.error("Invalid argument count");
        return;
    }

    func(id, cmd, ...argv.slice(1));
};