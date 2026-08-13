import { logHello } from "./logHello.js";
import { api } from "codername/api";
import "codername/callbacks";

logHello();
api.setClientOption(api.getPlayerIds()[0], "middleTextUpper", "hellow")

globalThis.onPlayerJoin = () => {

}
