import mysql from "mysql";
import crypto, { createHash, UUID } from "crypto";
import { User, generateToken } from "./users";

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
     * @param {string} token 
     * @returns {User | undefined}
     */
    async getUserWithToken(token) {
        let tokenHash = crypto.createHash("sha256").update(token).digest("hex").toString();

        let data = undefined;
        this.connection.query("select * from users where token = ?", [tokenHash], (error, results) => {
            if (error) throw error;
            data = results.at(0);
        });

        if (data === undefined) {
            return data;
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
        let data = undefined;
        this.connection.query("select * from users where uuid = ?", [uuid], (error, results) => {
            if (error) throw error;
            data = results.at(0);
        });

        if (data === undefined) {
            return data;
        }

        data.token = null

        return new User(data);
    }

    /**
     * 
     * @param {UUID} uuid
     * @param {boolean} deleteAfter
     */
    async getUserStandingMessages(uuid, deleteAfter = true) {
        let messages = [];
        
        this.connection.query("select user, content from standing where to = ?", [uuid], (error, results) => {
            if (error) throw error;
            messages = results;
        })
        
        if (deleteAfter) {
            this.connection.query("delete from standing where to = ?", [uuid], error => {
                if (error) throw error;
            })
        }

        return messages;
    }

    /**
     * 
     * @param {UUID} user
     * @param {UUID} receiver
     * @param {string} content
     */
    async addStandingMessage(id, user, receiver, content) {
        this.connection.query("insert into standing values (id, user, receiver, content) (?, ?, ?, ?)", [id, user, receiver, content], error => {
            if (error) throw error;
        });
        this.connection.commit();
    }

    /**
     * 
     * @param {UUID} user 
     * @param {"online" | "do not disturb" | "hidden"} status 
     */
    async updateUserStatus(user, status) {
        this.connection.query("update users set status = ? where uuid = ?", [status, user], error => {
            if (error) throw error;
        });
        this.connection.commit();
    }

    /**
     * 
     * @param {string} id 
     */
    async deleteStandingMessage(id) {
        this.connection.query("delete from standing set where id = ?", [id], error => {
            if (error) throw error;
        });
        this.connection.commit();
    }

    /**
     * Checks if nickname is not taken and fits to name regex
     * @param {string} name
     * @returns {void} returns is nickname taken and fits to name regex
     */
    checkName(name) {
        const regex = new RegExp("^[a-zA-Z0-9_-]+$")
        if (!(regex.test(name))) return false;

        let userCount;
        this.connection.query("select count(*) from users where name = ?", [nickname], (error, results) => {
            if (error) throw error;
            userCount = results[0]
        })
        if (userCount >= 1) return false;

        return true
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