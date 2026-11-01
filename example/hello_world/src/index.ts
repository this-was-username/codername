import { logHello } from "./logHello.js";
import * as chat from "./chat.js";
import { api } from "codername/api";
import { debug } from "codername/logging";
import "codername/callbacks";

logHello();
api.setClientOption(api.getPlayerIds()[0], "middleTextUpper", "middleTextUpper")

globalThis.onPlayerJoin = (id) => {
    api.log(id, "hello world to log");
    debug("hello to debug log")
}

globalThis.onPlayerChat = (...args) => chat.onPlayerChat(...args);
