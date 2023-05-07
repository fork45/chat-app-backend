import express from "express";
import { Server } from "socket.io";
import { joinConversation, createConversation, getConversation } from "./models/conversations";
import { DatabaseService } from "./models/database";

export function run(serverPort, ioPort, dbHost, dbUser, dbPassword) {
    const httpServer = express()
    const io = new Server()
    const databaseService = new DatabaseService(dbHost, dbUser, dbPassword);

    let conversationJoin = io.of("/cnv")

    httpServer.post("/conversation", async (request, response) => {
        let user = databaseService.getUserWithToken(request.headers.authorization);
        if (user === null) {
            response.status(400).send({ "message": "The header 'authorization' must contain your account token"})
            return;
        }

        let key = await databaseService.createConversation();

        response.status(200).send({"key": key})
    })

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
        }

        // TODO: Make this better
        /*
        if (!(io.sockets.adapter.rooms.has(key))) {
            response.status(404).send({"message": "There's no chat with this key"})
            return;
        }

        let socketIds = io.sockets.adapter.rooms[request.body.key];
        let socket = null;

        socketIds.map(socketId => {
            if (io.sockets.sockets[socketId].data.token === request.headers.authorization) {
                socket = io.sockets.sockets[socketId]
                return;
            }
        })

        if (socket === null) {
            response.status(403).send({"message": "You don't have permission to send message to this conversation"})
            return;
        }

        let conversation = await databaseService.getConversation(request.body.key);
        await conversation.sendMessageToRecipient(socket.data.user, request.body, io.sockets)
        response.status(204).send();        
        

        let conversation = databaseService.getConversation(request.body.conversation);
        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).send({
                message: "Token not found in database"
            })
            return;
        } else if (!conversation) {
            response.status(404).send({
                message: "Conversation not found"
            })
            return;
        } else if (!conversation.taken) {
            response.status(400).send({
                message: "This conversation is not taken, if you are not the creator of this conversation, then try to join this conversation and send this request again"
            })
            return;
        } else if (user.uuid !== conversation.firstUser.uuid && user.uuid !== conversation.secondUser.uuid) {
            response.status(403).send({
                message: "You don't have access to send messages in this conversation"
            })
            return;
        }

        await conversation.sendMessageToRecipient(user, request.body.content, io.sockets);
        */
    })

    httpServer.listen(serverPort, () => {
        console.log(`Example app is listening on port ${ioPort}`)
    })

    io.on("connection", async (socket) => {
        socket.data.token = socket.request.headers.authorization
        socket.data.user = await databaseService.getUserWithToken(token=socket.data.token)
    })

    io.on("disconnect", async (socket) => {
        socket.rooms.forEach(key => {
            databaseService.forcedDeleteConversation(key, socket);
            
            io.to(key).emit("forcedRoomDisconnect");

            io.to(key).socketsLeave(key)
        })

        socket.disconnect(true);
    })

    conversationJoin.on("connection", async (socket) => {
        const body = JSON.parse(socket.request.read().toString());
        if (await databaseService.joinConversation(body.key) === false) {
            socket.emit("error", { message: "Conversation not found, or maybe it has already been taken"});
            return;
        };

        let partner = io.in(body.key).fetchSockets()[0].data.user;

        socket.join(body.key)

        data = {
            uuid: partner.uuid,
            name: partner.name,
            nickname: partner.nickname, 
        }

        if (partner.status === "")

        socket.emit("success", {
            key: body.key,
            user: {
                uuid: partner.uuid,
                name: partner.name,
                nickname: partner.nickname, 
            }
        });
    })

    io.listen(ioPort)
}