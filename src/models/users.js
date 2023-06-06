import { Socket } from "socket.io";

export function generateToken() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPRQSTUVWXYZ1234567890.-!';
    const rand = (min = 0, max = 1000) => Math.floor(Math.random() * (max - min) + min);
    const randchars = [];
    for (let i = 0; i < 50; i++) {
        randchars.push(chars[rand(0, chars.length)]);
    }

    return randchars.join('');
}

export class User {
    /**
     * 
     * @param {} data
     * @param {Socket} socket1
     */
    constructor(data, socket = null) {
        this.data = data

        this.uuid = data._id
        this.name = data.name
        this.nickname = data.nickname
        this.token = data.token
        this.status = statuses[data.status]
        this.conversationsWith = data.conversationsWith
        this.lastExitTime = data.lastExitTime ? new Date(data.lastExitTime * 1000) : null;

        this.socket = socket
    }

    generateSecureJson() {
        let data = this.data;
        
        // WTF is this :skull:
        delete data.token
        delete data.status
        delete data.conversationsWith
        delete data.lastExitTime
        delete data.password

        return data;
    }
}

export const statuses = {
    0: "online",
    1: "do not disturb",
    2: "hidden",
    3: "offline"
}