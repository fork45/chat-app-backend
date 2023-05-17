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

        this.uuid = data.uuid
        this.name = data.name
        this.nickname = data.nickname
        this.token = data.token
        this.status = statuses[data.status]

        this.socket = socket
    }
}

export const statuses = {
    0: "online",
    1: "do not disturb",
    2: "hidden",
    3: "offline"
}