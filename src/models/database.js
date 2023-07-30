import { MongoClient } from "mongodb";
import crypto, { createHash } from "crypto";
import { User, generateToken } from "./users.js";
import { Message, generateId } from "./messages.js"

export class DatabaseService {

    constructor(uri) {
        this.uri = uri
        this.client = new MongoClient(uri, {useNewUrlParser: true});
        this.client.connect();

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
        let uuid = crypto.randomUUID();
        let token = generateToken(uuid, password);
        let tokenHash = createHash("sha256").update(token).digest("hex").toString()
        let passwordHash = createHash("sha256").update(password).digest("hex").toString();

        if (!(this.checkName(name))) return false;
        if (!(this.checkNickname(nickname))) return false;

        let userObject;

        await this.users.insertOne({
            _id: uuid,
            name: name,
            nickname: nickname,
            password: passwordHash,
            token: tokenHash,
            status: "online",
            conversationsWith: [],
            lastExitTime: null,
            avatar: null,
        }).then(document => {
            userObject = new User({
                _id: uuid,
                name: name,
                nickname: nickname,
                token: token,
                status: "online",
                conversationsWith: [],
                lastExitTime: null,
            });
        });

        return userObject;
    }

    /**
     * 
     * @param {string} uuid 
     */
    async deleteUser(uuid) {
        let user = await this.getUserWithUUID(uuid);

        let conversations = user.conversationsWith

        for (const conversation in conversations) {
            await this.deleteMessagesInConversation(user, conversation);

            await this.removeConversationFromUser(user, conversation);
            await this.removeConversationFromUser(conversation, user);
        }

        await this.users.deleteOne({
            _id: uuid
        });
    }

    /**
     * 
     * @param {UUID} id 
     * @param {string} newPassword 
     * @returns {string} New Token
     */
    async changePassword(id, newPassword) {
        let hash = crypto.createHash("sha256").update(newPassword).digest("hex");
        let token = generateToken(id, newPassword);

        await this.users.updateOne({
            _id: id
        }, {
            $set: {
                password: hash,
                token: token
            }
        });

        return token;
    }

    async changeNickname(id, nickname) {
        await this.users.updateOne({
            _id: id
        }, {
            $set: {
                nickname: nickname
            }
        });
    }

    /**
     * 
     * @param {string} name 
     * @param {string} password 
     * @returns {[User, string] | [false, string]}
     */
    async login(name, password) {
        let user = await this.getUserWithName(name);

        if (!user) {
            return [false, "no user"];
        }

        let token = generateToken(user.uuid, password);

        if (crypto.createHash("sha256").update(token).digest("hex") !== user.token) {
            return [false, "incorrect password"];
        }

        return [token, user];
    }

    /**
     * @param {UUID} user
     */
    async changeLastExitTime(user) {
        await this.users.updateOne({
            _id: user
        }, {
            $set: {
                lastExitTime: Math.floor(new Date().getTime() / 1000)
            }
        });
    }

    /**
     * 
     * @param {import("crypto").UUID} user 
     */
    async getLastMessageInConversation(user) {
        let message = await this.messages.findOne({
            $or: [{ author: user }, { receiver: user }]
        }, {
            sort: [{ datetime: -1 }]
        });

        return message;
    }

    /**
     * @param {UUID} user
     */
    async getUserMessagesAfterExitTime(user) {
        let account = await this.getUserWithUUID(user);
        if (!account.lastExitTime) {
            return null;
        }
        
        let messages = this.messages.find({
            type: "message", 
            datetime: { $gte: account.lastExitTime.getTime() / 1000 },
            $or: [{ author: account.uuid }, { receiver: account.uuid }]
        }, {
            sort: [{ datetime: -1 }]
        });

        return await messages.toArray();
    }

    async getUserWithName(name) {
        let data = await this.users.findOne({
            name: name
        });

        return data ? new User(data) : null;
    }

    /**
     * 
     * @param {string} token 
     * @returns {User | undefined}
     */
    async getUserWithToken(token) {
        let tokenHash = crypto.createHash("sha256").update(token).digest("hex").toString();

        let user = await this.users.findOne({
            token: tokenHash
        });

        if (!user) return undefined

        user.token = token

        return new User(user);
    }

    /**
     * 
     * @param {UUID} uuid
     * @returns {User | null}
     */
    async getUserWithUUID(uuid) {
        let data = await this.users.findOne({
            _id:  uuid
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
            $set: {status: status}
        });
    }

    /**
     * 
     * @param {import("crypto").UUID} uuid 
     * @param {string} hash 
     */
    async setAvatar(uuid, hash) {
        await this.users.updateOne({
            _id: uuid
        }, {
            $set: { avatar: hash }
        });
    }

    /**
     * 
     * @param {UUID} user
     * @param {UUID} from
     */
    async getUserMessages(user, from, limit=50) {
        // (author == user, receiver == from) or (author == from, receiver == user)
        let messages = this.messages.find({
            type: "message",
            $or: [ 
                { author: user, receiver: from }, 
                { author: from, receiver: user }
            ],
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
    async sendKey(author, receiver, key, iv) {
        await this.messages.insertOne({
            type: "key",
            _id: generateId(),
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
            $or: [
                { author: user, receiver: secondUser },
                { author: secondUser, receiver: user }
            ],
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
            $set: {
                content: content,
                editDatetime: Math.floor(new Date().getTime() / 1000)
            }
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
     * @param {UUID} first_user 
     * @param {UUID} second_user 
     */
    async getKey(first_user, second_user) {
        let key = await this.messages.findOne({
            type: "key",
            author: first_user,
            receiver: second_user
        });

        return key;
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
            "$push": { conversationsWith: secondUser }
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
            $pull: { conversationsWith: secondUser }
        });
    }

    /**
     * @param {string} user
     * @param {string} secondUser
     */
    async hasConversationWith(user, secondUser) {
        let count = await this.users.countDocuments({
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
        let key = await this.messages.findOne({
            type: "key",
            author: user,
            receiver: secondUser
        })

        return key ? true : false;
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
        });

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
        }, {
            $set: {
                read: true
            }
        });
    }


    /**
     * Checks if name is not taken and fits to name regex
     * @param {string} name
     * @returns {boolean} returns is name taken and fits to name regex
     */
    checkName(name) {
        const regex = this.checkNickname(name);
        if (!regex) return false;

        let userCount = this.users.countDocuments({
            name: name
        })

        if (userCount >= 1) return false;

        return true
    }

    /**
     * Checks if nickname fits to nickname regex
     * @param {string} nickname
     * @returns {boolean} returns is fits to nickname regex
     */
    checkNickname(nickname) {
        const regex = new RegExp("^[a-zA-Z0-9_-]+$")
        
        return regex.test(nickname);
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