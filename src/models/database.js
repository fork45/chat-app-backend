import { MongoClient } from "mongodb";
import crypto, { createHash, UUID } from "crypto";
import { User, generateToken } from "./users";
import { Message } from "./messages"

export class DatabaseService {

    constructor(uri) {
        this.uri = uri;
        this.client = new MongoClient(uri);

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

        await this.users.insertOne({
            _id: uuid,
            name: name,
            nickname: nickname,
            password: passwordHash,
            token: tokenHash,
            status: "online",
            conversationsWith: [],
            lastExitTime: null,
            avatar: null
        });

        let userObject = new User({
            _id: uuid,
            name: name,
            nickname: nickname,
            token: token,
            status: "online",
            conversationsWith: [],
            lastExitTime: null,
            avatar: null,
        })

        return userObject;
    }

    /**
     * @param {UUID} user
     */
    async changeLastExitTime(user) {
        await this.users.updateOne({
            _id: user
        }, {
            lastExitTime: Math.floor(new Date().getTime() / 1000)
        });
    }

    /**
     * @param {UUID} user
     */
    async getUserMessagesAfterExitTime(user) {
        let account = this.getUserWithUUID(user);
        
        let messages = this.messages.find({
            type: "message",
            datetime: {$gte: account.lastExitTime.getSeconds()},
            $and: [
                { $or: [{ author: user }, { author: from }] },
                { $or: [{ receiver: user }, { receiver: from }] }
            ]
        }, {
            sort: [{ datetime: -1 }]
        });

        return messages ? await messages.toArray() : [];
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

    async setUserAvatar(user, avatar) {
        await this.users.updateOne({
            _id: user
        }, {
            avatar: avatar
        });
    }

    /**
     * 
     * @param {UUID} user
     * @param {UUID} from
     */
    async getUserMessages(user, from, limit=50) {
        // (author == user or author == from) and (receiver == user or receiver == from)
        let messages = this.messages.find({
            type: "message",
            $and: [
                { $or: [{ author: user }, { author: from }] },
                { $or: [{ receiver: user }, { receiver: from }] }
            ]
        }, {
            limit: limit,
            sort: [{datetime: -1}]
        });

        return messages ? await messages.toArray() : [];
    }

    async getUserMessagesAfterMessage(user, from, messageId, limit) {
        let message = await this.messages.findOne({
            _id: messageId
        });

        if (!message) {
            return false;
        }
        
        // (author == user or author == from) and (receiver == user or receiver == from)
        let messages = this.messages.find({
            type: "message",
            $and: [
                { $or: [{ author: user }, { author: from }] },
                { $or: [{ receiver: user }, { receiver: from }] }
            ],
            datetime: { $gt: message.datetime }
        }, {
            limit: limit,
            sort: [{datetime: -1}]
        });

        return messages ? await messages.toArray() : [];
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
            editDatetime: null,
            read: false
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
     * @param {UUID} user
     * @param {UUID} secondUser
     */
    async deleteMessagesInConversation(user, secondUser) {
        await this.messages.deleteMany({
            type: "message",
            "$and": [
                { $or: [{ author: user }, { author: secondUser }] },
                { $or: [{ receiver: user }, { receiver: secondUser }] }
            ]
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
     * 
     * @param {UUID} user 
     * @param {UUID} secondUser 
     */
    async addConversationToUser(user, secondUser) {
        await this.users.updateOne({
            _id: user,
        }, {
            "$push": {conversationsWith: secondUser}
        });
    }

    /**
     * 
     * @param {UUID} user 
     * @param {UUID} secondUser 
     */
    async removeConversationFromUser(user, secondUser) {
        await this.users.updateOne({
            _id: user,
        }, {
            "$pull": { conversationsWith: secondUser }
        });
    }

    /**
     * @param {string} user
     * @param {string} secondUser
     */
    async hasConversationWith(user, secondUser) {
        let count = this.users.countDocuments({
            _id: user,
            conversationsWith: { "$in": [secondUser] }
        })

        return count >= 1 ? true : false;
    }

    /**
     * @param {string} user
     * @param {string} secondUser
     * @returns {boolean | null}
     */
    async conversationReady(user, secondUser) {
        /**
         * Maybe you don't get what i want to do
         * when user X is trying to create conversation with user Y
         * To user X in the `conversationsWith` is added user Y
         * When user Y gives his RSA key, then user X is added to user Y `conversationsWith` and conversation is ready
         * 
         * To understand if user Y has given a key, I need to check if user Y `conversationsWith` has user X
         */

        if (!this.hasConversationWith(secondUser, user)) {
            return null;
        } else if (this.hasConversationWith(user, secondUser)) {
            return true;
        }

        return false;
    }

    async findWaitingUsers(user) {
        let conversations = await this.getUserConversationsWith(user);

        // Find users that have user in their list


        let users = await this.users.find({
            conversationsWith: { $in: user }
        });

        return users.filter(user => !conversations.includes(user));
    }

    /**
     * 
     * @param {string} user
     * @returns {Object[]} 
    */
    async getUserConversationsWith(user) {
        let account = await this.users.findOne({
            _id: user,
        })

        return account.conversationsWith;
    }

    /**
     * 
     * @param {string} id
     * 
     */
    async markMessageAsRead(id) {
        await this.messages.updateOne({
            _id: id,
            read: true
        });
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