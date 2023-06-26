import crypto from "crypto";

export function generateToken(uuid, password) {
    const firstHash = crypto.createHash("sha256").update(`${uuid}:${password}`).digest("hex");
    const secondHash = crypto.createHash("sha256").update(`${password}:${uuid}`).digest("hex");
    const thirdHash = crypto.createHash("sha256").update(`${password+uuid}`).digest("hex");

    return `${firstHash}.${secondHash}.${thirdHash}`;
}

export class User {
    /**
     * 
     * @param {Object} data
     */
    constructor(data) {
        this.data = data

        this.uuid = data._id
        this.name = data.name
        this.nickname = data.nickname
        this.token = data.token
        this.status = data.status
        this.conversationsWith = data.conversationsWith
        this.lastExitTime = data.lastExitTime ? new Date(data.lastExitTime * 1000) : null;
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