import { MongoClient } from "mongodb";
import crypto, { createHash, UUID } from "crypto";
import { User, generateToken } from "./users";

export class DatabaseService {

    constructor(host, user, password) {
        this.client = new MongoClient()

        this.database = this.client.db("main");
        this.users = this.database.collection("users");
        this.messages = this.database.collection("messages");

        /*
        this.connection = mysql.createConnection({
            host: host,
            user: user,
            password: password
        })

        this.connection.connect(err => {
            if (err) throw err;
            console.log("connected to database");
        })
        let databases;
        this.connection.query("select name from master.sys.databases", (error, results) => {
            if (error) throw error;
            databases = results;
        });

        if (!("main" in databases)) this.connection.query("create database main");

        this.connection = mysql.createConnection({
            host: host,
            user: user,
            password: password,
            database: "main"
        })

        this.connection.query("alter table users add column uuid varchar(255); add column token varchar(50); add column password varchar(100); add column name varchar(255); add column nickname varchar(255); add column status tinyint)");
        // Messages that were sent when the recipient was offline
        this.connection.query("alter table standing add column id varchar(50); add column user varchar(255); add column receiver varchar(255); add column content varchar(900)")
        */
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
     * @param {boolean} deleteAfter
     */
    async getUserStandingMessages(user, deleteAfter = true) {
        let messages = this.messages.find({
            receiver: uuid
        })

        if (deleteAfter) {
            await this.messages.deleteMany({
                receiver: uuid
            })
        }

        return messages ? messages.toArray() : [];
    }

    /**
     * 
     * @param {UUID} user
     * @param {UUID} receiver
     * @param {string} content
     */
    async addStandingMessage(id, user, receiver, content) {
        await this.messages.insertOne({
            _id: id,
            user: user,
            receiver: receiver,
            content: content
        });
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
     * @param {string} id 
     */
    async deleteStandingMessage(id) {
        await this.users.deleteOne({
            _id: id
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