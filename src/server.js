import express from "express";
import { Server } from "socket.io";
import { DatabaseService } from "./models/database";

export function run(serverPort, ioPort, dbHost, dbUser, dbPassword) {
    const httpServer = express()
    const io = new Server()
    const databaseService = new DatabaseService(dbHost, dbUser, dbPassword);

    httpServer.post("/accounts", async (request, response) => {
        if ((request.body.nickname.length > 255 || request.body.nickname.length <= 3) || (request.body.name.length > 255 || request.body.name.length <= 3)) {
            response.status(400).send({
                opcode: 4,
                message: "Your nickname or name must be no longer than 255 letters and no less than 4 letters"
            });
            return;
        } else if (request.body.password.length < 8) {
            response.status(400).send({
                opcode: 5,
                message: "Password length should be long than 8 characters"
            });
        }

        let user = databaseService.addUser();
        if (user === false) {
            response.status(400).send({
                opcode: 6,
                message: "Your name does not match this regex: ^[a-zA-Z0-9_-]+$"
            });
            return;
        }

        response.status(200).send({
            uuid: user.uuid,
            name: user.name,
            nickname: user.nickname,
            token: user.token
        });
    })

    httpServer.post("/send", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });
            
            return;
        } else if (request.body.content.length > 900 || request.body.content.length <= 0) {
            response.status(400).send({
                opcode: 3,
                message: "Your message must be no longer than 900 letters and not less than 1 letter"
            })
        }

        let receiverUuid = request.body.receiver
        let receiver = databaseService.getUserWithUUID(receiverUuid);

        if (!receiver) {
            response.status(404).send({
                opcode: 2, 
                message: "Receiver not found"
            });
            return;
        }

        let socket = undefined;
        (await io.fetchSockets()).filter(ioSocket => {
            if (ioSocket.data.uuid === receiverUuid) {
                socket = ioSocket;
                return;
            }
        })

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            await response.status(401).send( {
            opcode: 1,
            message: "Invalid Token"
        } )
        }
        else if (socket === undefined) {
            databaseService.addStandingMessage(user.uuid, receiverUuid, request.body.content);
            return;
        }

        socket.emit("message", {
            user: user.uuid,
            content: request.body.content
        });
    })

    httpServer.listen(serverPort, () => {
        console.log(`Example app is listening on port ${ioPort}`)
    })

    io.of("/status").on("connection", (socket) => {
        socket.on("subscribe", (request) => {
            let user = databaseService.getUserWithUUID(request.user);
            if (!user) {
                socket.emit("error", {
                    opcode: 2,
                    message: "User not found"
                })
                return;
            }

            socket.join(user.uuid);
        })

        socket.on("unsubscribe", (request) => {
            let user = databaseService.getUserWithUUID(request.user);
            if (!user) {
                socket.emit("error", { 
                    opcode: 2,
                    message: "User not found"
                })
                return;
            }

            socket.leave(user.uuid);
        })

        socket.on("change", (request) => {
            if (!(request.status in ["online", "do not disturb", "hidden"])) {
                socket.emit("error", {
                    opcode: 7,
                    message: "There's only three types of status: online, do not disturb and hidden"});
            } else if (socket.data.user.status === request.status) {
                return;
            }

            databaseService.updateUserStatus(socket.data.user.uuid, request.status);
            socket.data.user.status = request.status

            if (request.status === "hidden") {
                io.in(socket.data.uuid).emit("status", {status: "offline"});
                return;
            }

            io.in(socket.data.user.uuid).emit("status", request.status);
        })
    })

    io.on("connection", async (socket) => {
        socket.data.token = socket.handshake.auth["token"]
        socket.data.user = await databaseService.getUserWithToken(token=socket.data.token)
        if (socket.data.user === undefined) {
            socket.emit("error", {
                opcode: 0,
                message: "No token in request header"
            });
            socket.disconnect(true);
            return;
        }

        let messages = databaseService.getUserStandingMessages(socket.data.user.uuid);
        socket.emit("standing", messages);

        if (!(socket.data.user.status in ["hidden", "do not disturb"])) {
            io.in(socket.data.user.uuid).emit("status", { "status": "online" });
        } else if (socket.data.user.status === "do not disturb") {
            io.in(socket.data.user.uuid).emit("status", { "status": "do not disturb" });
        }

        socket.on("disconnect", (reason) => {
            io.in(socket.data.user.uuid).emit("status", { "status": "offline" });
        })
    })

    io.listen(ioPort)
}