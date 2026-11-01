import { api } from "../../../lib/api"

export const onPlayerChat: typeof globalThis.onPlayerChat = (id, msg) => {
    api.broadcastMessage(api.getEntityName(id) + ": " + msg)
}