import express from "express";
import { Server } from "socket.io";
import { DatabaseService } from "./models/database";

export function run(serverPort, ioPort, dbHost, dbUser, dbPassword) {
    const httpServer = express()
    const io = new Server()
    const databaseService = new DatabaseService(dbHost, dbUser, dbPassword);

    httpServer.post("/accounts", async (request, response) => {
        if (request.body.nickname.length > 255 && request.body.name.length > 255) {
            response.status(400).send({ message: "Nickname and name can't be long than 255 characters" });
            return;
        } else if (request.body.password.length < 8) {
            response.status(400).send({ message: "Password length should be long than 8 characters" });
        }

        let user = databaseService.addUser();
        if (user === false) {
            response.status(400).send({ message: "The name must match that regex: ^[a-zA-Z0-9_-]+$" });
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
                message: "You need account token to make request like this"
            });
            
            return;
        } else if (request.body.content.length() > 900) {
            response.status(400).send({
                message: "Your message should be not longer than 900 characters"
            })
        }

        let receiverUuid = request.body.receiver
        let receiver = databaseService.getUserWithUUID(receiverUuid);

        if (!receiver) {
            response.status(404).send({message: "User not found"});
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

        if (socket === undefined) {
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

    io.on("connection", async (socket) => {
        socket.data.token = socket.request.headers.authorization
        socket.data.user = await databaseService.getUserWithToken(token=socket.data.token)
        if (socket.data.user === undefined) {
            socket.emit("error", {
                message: "You need account token to make request like this"
            });
            socket.disconnect(true);
            return;
        }

        let messages = databaseService.getUserStandingMessages(socket.data.user.uuid);
        socket.emit("standing", messages);
    })

    io.listen(ioPort)
}