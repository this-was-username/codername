import { api } from "../lib/api.js";


export type LogLevelType = 0 | 1 | 2 | 3;

export const logLevels = {
    error: 0 as LogLevelType,
    warning: 1 as LogLevelType,
    info: 2 as LogLevelType,
    debug: 3 as LogLevelType,
}
const colors = {
    0: "red",
    1: "yellow",
    2: "blue",
    3: "grey"
}
const logLevel = 3;


export const log = (level: LogLevelType, ...data: any[]) => {
    for (const id of api.getPlayerIds()) {
        if (level <= logLevel) {
            api.sendMessage(id, [
                {
                    str: "LOG: ",
                    style: {
                        color: "#d5f2fe"
                    }
                },
                {
                    str: data.join(", "), style: {
                        color: colors[level]
                    }
                }
            ])
        }
    }
}
export const debug = (...d: unknown[]) => log(logLevels.debug, ...d);
export const info = (...d: unknown[]) => log(logLevels.info, ...d);
export const warning = (...d: unknown[]) => log(logLevels.warning, ...d);
export const error = (...d: unknown[]) => log(logLevels.error, ...d);
