require("dotenv").config();
const server = require("./server");

server.run(
    process.env.httpServerPort, 
    process.env.socketServerPort,
    process.env.dbConnectUri
);