import { MongoClient } from "mongodb";
import crypto, { createHash, UUID } from "crypto";
import { User, generateToken } from "./users";
import { Message } from "./messages"

export class DatabaseService {

    constructor(host, user, password) {
        this.client = new MongoClient()

        this.database = this.client.db("main");
        this.users = this.database.collection("users");
        this.messages = this.database.collection("messages");
    }

    /**
     * 
     * @param {string} name
     * @param {string} password
     * @returns {User | false}
     */
    async addUser(nickname, name, password) {
        let token = generateToken();
        let tokenHash = createHash("sha256").update(token).digest("hex").toString()
        let uuid = crypto.randomUUID();
        let passwordHash = createHash("sha256").update(password).digest("hex").toString();

        if (!(this.checkName(name))) return false;
        
        let data = [uuid, tokenHash, passwordHash, name, nickname, 0]

        await this.users.insertOne({
            _id: uuid,
            name: name,
            nickname: nickname,
            password: passwordHash,
            token: tokenHash,
            status: "online"
        });

        let userObject = new User({
            _id: uuid,
            name: name,
            nickname: nickname,
            token: token,
            status: "online"
        })

        return userObject;
    }

    /**
     * 
     * @param {string} token 
     * @returns {User | undefined}
     */
    async getUserWithToken(token) {
        let tokenHash = crypto.createHash("sha256").update(token).digest("hex").toString();

        let data = await this.users.findOne({
            token: tokenHash
        });

        if (!data) {
            return undefined;
        }

        data.token = token

        return new User(data);
    }

    /**
     * 
     * @param {UUID} uuid
     * @returns {User | null}
     */
    async getUserWithUUID(uuid) {
        let data = await this.users.findOne({
            "_id":  uuid
        })

        return data ? new User(data) : undefined;
    }

    /**
     * 
     * @param {UUID} user 
     * @param {"online" | "do not disturb" | "hidden"} status 
     */
    async updateUserStatus(user, status) {
        await this.users.updateOne({
            _id: user
        }, {
            status: status
        });
    }

    /**
     * 
     * @param {UUID} user
     * @param {UUID} from
     */
    async getUserMessages(user, from) {
        // (author == user or author == from) and (receiver == user or receiver == from)
        let messages = this.messages.find({
            type: "message",
            $and: [
                { $or: [{ author: user }, { author: from }] },
                { $or: [{ receiver: user }, { receiver: from }] }
            ]
        }, {
            sort: [ { datetime: -1 } ]
        });

        return messages ? messages.toArray() : [];
    }

    /**
     * @param {string} id
     * @param {UUID} author
     * @param {UUID} receiver
     * @param {string} content
     */
    async addMessage(id, author, receiver, content) {
        await this.messages.insertOne({
            type: "message",
            _id: id,
            author: author,
            receiver: receiver,
            content: content,
            datetime: Math.floor(new Date().getTime() / 1000),
            editDatetime: null
        });
    }

    /**
     * 
     * @param {UUID} author 
     * @param {UUID} receiver 
     * @param {string} key 
     */
    async sendKey(author, receiver, key) {
        await this.messages.insertOne({
            type: "key",
            _id: id,
            author: author,
            receiver: receiver,
            content: key,
            datetime: Math.floor(new Date().getTime() / 1000)
        });
    }

    /**
     * 
     * @param {string} id 
     */
    async deleteMessage(id) {
        await this.messages.deleteOne({
            _id: id
        });
    }

    /**
     * 
     * @param {string} id 
     * @param {string} content 
     */
    async editMessage(id, content) {
        await this.messages.updateOne({
            type: "message",
            _id: id
        }, {
            content: content,
            editDatetime: Math.floor(new Date().getTime() / 1000)
        })
    }

    /**
     * 
     * @param {string} id 
     * @returns {Message}
     */
    async getMessage(id) {
        let data = await this.messages.findOne({
            type: "message",
            _id: id
        })


        return data ? new Message(data) : undefined;
    }

    /**
     * 
     * @param {UUID} user 
     * @param {UUID} author
     */
    async haveKey(user, author) {
        let count = await this.messages.countDocuments({
            type: "key",
            author: author,
            receiver: user
        });

        return count >= 1 ? true : false;
    }

    /**
     * 
     * @param {string} id 
     */
    async messageExists(id) {
        let count = await this.messages.countDocuments({
            type: "message",
            _id: id
        });

        return count >= 1 ? true : false;
    }

    /**
     * Checks if nickname is not taken and fits to name regex
     * @param {string} name
     * @returns {void} returns is nickname taken and fits to name regex
     */
    checkName(name) {
        const regex = new RegExp("^[a-zA-Z0-9_-]+$")
        if (!(regex.test(name))) return false;

        let userCount = this.users.countDocuments({
            name: name
        })

        if (userCount >= 1) return false;

        return true
    }

    /**
     * Destroys this service and destroys connection
     * @returns {void}
     */
    destroyConnection() {
        this.client.close(true);
        delete this
    }
}