import dotenv from "dotenv";
import server from "./server.js";

dotenv.config()

console.log(process.env.dbConnectUri)
console.log(process.env.httpServerPort)

server(
    process.env.httpServerPort, 
    process.env.socketServerPort,
    process.env.dbConnectUri
);