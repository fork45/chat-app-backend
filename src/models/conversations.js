import { User } from "./users";
import { Server } from "socket.io";

export function generateKey() {
    const chars = 'abcdefgh1234567890';
    const rand = (min = 0, max = 1000) => Math.floor(Math.random() * (max - min) + min);
    const randchars = [];
    for (let i = 0; i < 6; i++) {
        randchars.push(chars[rand(0, chars.length)]);
    }

    return randchars.join('');
}

export class Conversation {
    constructor(data) {
        this.data = data

        this.key = data.key
        this.taken = data.taken
        this.firstUser = data.firstUser
        this.secondUser = data.secondUser
    }

    /**
     * 
     * @param {User} user
     * @param {string} message
     * @param {Server} server
     */
    async sendMessageToRecipient(user, message, server) {
        let data = {
            content: message,
            conversaton: this.key,
            user: user.uuid
        }

        let sockets = await server.to(this.key).fetchSockets()
        if (sockets[0].data.uuid == user.uuid) {
            await sockets[1].send(data)
        } else {
            await sockets[0].send(data)
        }
    }
}