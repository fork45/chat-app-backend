import mysql from "mysql";
import crypto, { createHash } from "crypto";
import { User, generateToken } from "./users";
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
     * @param {string} name
     * @returns {void} returns is nickname taken and fits to name regex
     */
    checkName(name) {
        const regex = new RegExp("^[a-zA-Z0-9_-]+$")
        if (!(regex.test(name))) return false;

        let userCount = this.connection.query("select count(*) from users where name = ?", [nickname])
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