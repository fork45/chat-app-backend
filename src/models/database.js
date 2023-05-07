import mysql from "mysql";
import crypto, { createHash } from "crypto";
import { User, generateToken } from "./users";
import { Conversation, generateKey } from "./conversations";
import { Socket } from "socket.io";

export class DatabaseService {
    constructor(host, user, password) {
        this.connection = mysql.createConnection({
            host: host,
            user: user,
            password: password
        })

        this.connection.connect(err => {
            if (err) throw err;
            console.log("connected to database");
        })
        let databases = this.connection.query("select name from master.sys.databases");
        if (!("main" in databases)) this.connection.query("create database main");

        this.connection = mysql.createConnection({
            host: host,
            user: user,
            password: password,
            database: "main"
        })

        this.connection.query("alter create table users (uuid varchar(255), token varchar(50), password varchar(100), name varchar(255), nickname varchar(255), status tinyint)");
        this.connection.query("alter create table conversations (key varchar(255), taken BOOLEAN, firstUser varchar(255), secondUser varchar(255))");
    }

    /**
     * 
     * @param {string} uuid
     * @returns {string}
     */
    async createConversation(uuid) {
        const key = generateKey();

        data = [key, false, uuid, null]

        this.connection.query("insert into users (key, taken, firstUser, secondUser) values (?, ?, ?, ?)", data);
        this.connection.commit();

        return key;
    }

    /**
     * 
     * @param {string} uuid
     * @param {Socket} socket
     */
    async JoinConversation(key, socket) {
        let conversation = this.getConversation(key)
        
        if (!conversation) return -1;
        else if (conversation.taken) return -1;

        this.connection.query("update conversations set secondUser = ? where key = ?", [socket.data.uuid, key]);
        this.connection.commit();

        return conversation;
    }

    /**
     * 
     * @param {string} key 
     * @param {Socket} socket 
     */
    async takeConversation(key) {
        this.connection.query("update conversations set taken = true where key = ?", [key], error => {
            if (error) throw error;
        });
        
        this.connection.commit((error) => {
            if (error) throw error;
        });
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

        this.connection.query("insert into users (uuid, token, password, name, nickname, status) values (?, ?, ?, ?, ?)", data);
        this.connection.commit();

        let userObject = new User({
            uuid: uuid,
            name: name,
            nickname: nickname,
            token: token,
            status: "online"
        })

        return userObject;
    }

    /**
     * 
     * @param {string} key 
     * @param {Socket} socket
     */
    async deleteConversation(key, socket) {
        let conversation = await this.getConversation(key);

        if (!conversation) return -1;
        else if (!(key in socket.rooms)) return -2;

        this.connection.query("delete from conversations where key = ?", [key], error => {
            if (error) throw error;
        })

        this.connection.commit(callback = error => {
            if (error) throw error;
        })
    }

    /**
     * This used when one of the participants destroy the connection to the server
     * @param {string} key
     */
    async forcedDeleteConversation(key) {
        let conversation = await this.getConversation(key);

        if (!conversation) return -1;

        this.connection.query("delete from conversations where key = ?", [key], error => {
            if (error) throw error;
        })

        this.connection.commit(callback = error => {
            if (error) throw error;
        })
    }

    /**
     * 
     * @param {string} key 
     * @returns {Conversation | null}
     */
    async getConversation(key) {
        let data = null;
        this.connection.query("select * from conversations where key = ?", [key], (error, response) => {
            if (error) throw error;
            data = response;
        });

        if (data === null) return data;

        data.firstUser = this.getUserWithUUID(uuid = data.firstUser);
        data.secondUser = this.getUserWithUUID(uuid = data.secondUser);

        return new Conversation(data);
    }

    /**
     * 
     * @param {string} token 
     * @returns {User | null}
     */
    async getUserWithToken(token) {
        let tokenHash = crypto.createHash("sha256").update(token).digest("hex").toString();

        let data = null; 
        this.connection.query("select * from users where token = ?", [tokenHash], (error, response) => {
            if (error) throw error;
            data = response;
        });

        if (data === null) {
            return null;
        }

        data.token = token

        return new User(data);
    }

    /**
     * 
     * @param {string} uuid
     * @returns {User | null}
     */
    async getUserWithUUID(uuid) {

        let data = null;
        this.connection.query("select * from users where uuid = ?", [uuid], (error, response) => {
            if (error) throw error;
            data = response;
        });

        if (data === null) {
            return null;
        }

        data.token = null

        return new User(data);
    }

    /**
     * Checks if nickname is not taken and fits to name regex
     * @param {string} nickname
     * @returns {void} returns is nickname taken and fits to name regex
     */
    checkName(nickname) {
        const regex = new RegExp("^[a-zA-Z0-9_-]+$")
        if (!(regex.test(nickname))) return false;

        let userCount = this.connection.query("select count(*) from users where nicname = ?", [nickname])
        if (userCount >= 1) return false;

        return true
    }

    /**
     * Check if conversation is taken
     * @param {string} key 
     * @returns {boolean | null} Is conversation taken or not (returns null if conversation not found)
     */
    isTaken(key) {
        let taken = null;

        this.connection.query("select taken from conversations where key = ?", [key], (error, response) => {
            if (error) throw error;
            taken = response;
        })

        return taken;
    }

    /**
     * Destroys this service and destroys connection
     * @returns {void}
     */
    destroyConnection() {
        this.connection.destroy()
        delete this
    }
}