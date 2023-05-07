require("dotenv").config();
const server = require("./server");

server.run(
    process.env.httpServerPort, 
    process.env.socketServerPort,
    process.env.dbHost,
    process.env.dbUser,
    process.dbPassword
);