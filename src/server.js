import express from "express";
import { Server, Socket } from "socket.io";
import { DatabaseService } from "./models/database";
import { StorageService } from "./models/storage";
import { generateId } from "./models/messages";
import crypto from "crypto";

export function run(serverPort, ioPort, dbConnectUri) {
    const httpServer = express()
    const io = new Server()
    const databaseService = new DatabaseService(dbConnectUri);
    // TODO: Type configuration
    const storage = new StorageService({});

    httpServer.use(express.json());

    httpServer.post("/avatars", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let user = databaseService.getUserWithToken(request.header("authorization"));
        if (user === undefined) {
            response.status(401).send({
                opcode: 1,
                message: "Invalid token"
            });
            return;
        }

        if (request.file.mimetype !== "image/png" && request.file.mimetype !== "image/jpeg") {
            response.status(400).send({
                opcode: 22,
                message: "Avatar can be only jpeg or png"
            });
        }

        const avatarFile = request.file;

        // File can't be larger than 10 megabytes
        if (avatarFile.size > 10000000) {
            response.status(400).send({
                opcode: 29,
                message: "Avatar file can't be larger than 10 megabytes"
            });

            return;
        } else if (avatarFile.size === 0) {
            response.status(400).send({
                opcode: 23,
                message: "You can't send empty file to server"
            });
        }

        let [avatar, hash] = await storage.saveAvatar(avatarFile);
        await databaseService.setUserAvatar(user.uuid, hash);

        response.status(204).send();
    });

    httpServer.get("/files/avatars/:file", (request, response) => {
        let fileName = request.params.file;

        let file = storage.getAvatar(fileName);

        if (!file) {
            response.status(404).send({
                opcode: 21,
                message: "Avatar not found"
            });

            return;
        }

        response.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": file.length
        });
        response.end(file);
    });

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

            return;
        }

        let user = databaseService.addUser(request.body.nickname, request.body.name, request.body.password);
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
    });

    httpServer.get("/conversation", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        } else if (!databaseService.hasConversationWith(request.body.data.user)) {
            response.status(400).send({
                opcode: 18,
                message: "User didn't created conversation with you"
            });

            return;
        }

        let user = databaseService.getUserWithUUID(request.body.data.user);

        if (!user) {
            response.status(404).send({
                opcode: 2,
                message: "User not found"
            });

            return;
        }

        let data = user.generateSecureJson();

        response.status(200).send(data);
    });

    httpServer.get("/conversations", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        let users = await databaseService.getUserConversationsWith(user.uuid);

        response.status(200).send(users);
    });

    httpServer.post("/conversations", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }
        
        if (!request.body.key) {
            await response.status(400).send({
                opcode: 17,
                message: "Invalid RSA Key"
            });

            return;
        }

        try {
            crypto.publicDecrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
        } catch (error) {
            response.status(400).send({
                opcode: 17,
                message: "Invalid RSA Key"
            })

            return;
        }

        let user = databaseService.getUserWithUUID(request.body.user);

        if (!user) {
            await response.status(404).send({
                opcode: 2,
                message: "User not found"
            });

            return;
        } else if (databaseService.hasConversationWith(user.uuid, author.uuid)) {
            await response.status(400).send({
                opcode: 15,
                message: "You already have conversation with this user"
            });

            return;
        }

        await databaseService.addConversationToUser(author.uuid, user.uuid);
        await databaseService.sendKey(author.uuid, user.uuid);

        let socket = findSocket(user.uuid);
        let authorSocket = findSocket(author)

        if (socket) {
            socket.emit("newConversation", {
                user: author.uuid
            });
        }
        
        if (authorSocket) {
            let status = socket ? (socket.data.status === "hidden" ? "offline" : socket.data.status) : "offline"
            authorSocket.emit("status", {status: status});
        }

        response.status(204).send();
    });

    httpServer.delete("/conversations", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        let user = databaseService.getUserWithUUID(request.body.user);

        if (!user) {
            await response.status(404).send({
                opcode: 2,
                message: "User not found"
            });

            return;
        } else if (!databaseService.hasConversationWith(user.uuid, author.uuid)) {
            await response.status(404).send({
                opcode: 16,
                message: "You don't have conversation with this user"
            });

            return;
        }

        await databaseService.removeConversationFromUser(author, user);
        await databaseService.removeConversationFromUser(user, author);

        await databaseService.deleteMessagesInConversation(author, user);

        let socket = findSocket(user.uuid);

        if (socket) {
            socket.emit("conversationDelete", {
                user: author.uuid
            });
        }

        response.status(204).send();
    });

    httpServer.post("/key", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        try {
            crypto.publicDecrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890"));
        } catch (error) {
            response.status(400).send({
                opcode: 17,
                message: "Invalid RSA Key"
            })
            
            return;
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

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let ready = databaseService.conversationReady(user.uuid, receiver.uuid)

        if (ready === null) {
            await response.status(400).send({
                opcode: 18,
                message: "User didn't created conversation with you"
            });

            return;
        } else if (ready === true) {
            await response.status(400).send({
                opcode: 19,
                message: "You already sent RSA key"
            });

            return;
        }

        await databaseService.addConversationToUser(user.uuid, receiver.uuid);
        await databaseService.sendKey(user, key);

        let socket = findSocket(receiverUuid);

        if (socket) {
            socket.emit("conversationKey", {
                key: request.body.key,
                user: user.uuid
            });
        }

        response.status(204).send();
    });

    httpServer.get("/messages", async (request, response) => {
        request.body = JSON.parse(request.body);

        if (!request.body.limit) {
            request.body.limit = 50
        }

        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        } else if (request.body.limit < 1 || request.body.limit > 100) {
            response.status(400).send({
                opcode: 14,
                message: "Limit should be more than 1 and less than 100"
            });

            return;
        }

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            })

            return;
        }

        let interlocutor = databaseService.getUserWithUUID(request.body.user);

        if (!interlocutor) {
            response.status(404).send({
                opcode: 2,
                message: "User not found"
            });

            return;
        }
        let messages = [];

        if (request.body.after) {
            messages = databaseService.getUserMessagesAfterMessage(user.uuid, interlocutor.uuid, request.body.after, request.body.limit);
            
            if (messages === false) {
                await response.status(404).send({
                    opcode: 8,
                    message: "Message doesn't exists"
                });

                return;
            }
        } else {
            messages = databaseService.getUserMessages(user.uuid, interlocutor.uuid, request.body.limit);
        }

        response.status(200).send(messages);
    });

    httpServer.post("/messages", async (request, response) => {
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

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            await response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
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

        const id = generateId();

        databaseService.addMessage(id, user.uuid, receiverUuid, request.body.content);

        let socket = findSocket(receiverUuid);

        if (socket) {
            socket.emit("newMessage", {
                _id: id,
                user: user.uuid,
                content: request.body.content
            });
        }

        response.status(200).send({
            _id: id
        })
    });

    httpServer.delete("/messages", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).send({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }
        
        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let message = databaseService.getMessage(request.body.id);
        let receiver = databaseService.getUserWithUUID(message.receiver);

        if (!receiver) {
            response.status(404).send({
                opcode: 2,
                message: "Receiver not found"
            });

            return;
        }
        
        if (!message) {
            response.status(404).send({
                opcode: 8,
                message: "Message doesn't exists"
            });

            return;
        } else if (message.author !== user.uuid) {
            response.status(403).send({
                opocode: 11,
                message: "You can't delete this message because you're not an author"
            });
        }

        databaseService.editMessage(request.body.id);

        let socket = findSocket(receiver.uuid);

        if (socket) {
            socket.emit("deleteMessage", {
                user: user.uuid,
                _id: request.body._id
            });            
        }

        response.status(204).send();
    });

    httpServer.patch("/messages", async (request, response) => {
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

        let user = databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).send({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let message = databaseService.getMessage(request.body.id);
        let receiver = databaseService.getUserWithUUID(message.receiver);
        
        if (!message) {
            response.status(404).send({
                opcode: 8,
                message: "Message doesn't exists"
            });

            return;
        } else if (!receiver) {
            response.status(404).send({
                opcode: 2,
                message: "Receiver not found"
            });

            return;
        } else if (message.author !== user.uuid) {
            response.status(403).send({
                opcode: 9,
                message: "You can't edit this message because you're not an author"
            });
            
            return;
        }
        
        databaseService.editMessage(message._id, request.body.content);

        let socket = findSocket(receiver.uuid);

        if (socket) {
            socket.emit("editMessage", {
                _id: message._id,
                content: request.body.content
            });
        }

        response.status(204).send();
    });

    httpServer.listen(serverPort, () => {
        console.log(`Example app is listening on port ${ioPort}`)
    });

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

        let waitingUsers = await databaseService.findWaitingUsers(socket.data.user.uuid);
        socket.emit("waitingUsers", waitingUsers);

        let messages = await databaseService.getUserMessagesAfterExitTime(socket.data.user.uuid);
        socket.emit("newMessages", messages);

        let friends = (await io.in(socket.data.user.uuid).fetchSockets());

        friends.forEach(friend => {
            let friendStatus = friend ? (friend.data.status === "hidden" ? "offline" : friend.data.status) : null;

            if (friend) socket.emit("friendStatus", {status: friendStatus});
        });

        let status = socket.data.user.status === "hidden" ? "offline" : socket.data.user.status;

        io.in(socket.data.user.uuid).emit("status", {"status": status});

        databaseService.getUserConversationsWith(socket.data.user.uuid).then(users => {
            users.array.forEach(user => {
                socket.join(user);
            });
        });

        socket.on("disconnect", (reason) => {
            io.in(socket.data.user.uuid).emit("status", { "status": "offline" });
            
            databaseService.changeLastExitTime(socket.data.uuid);
        });

        socket.on("markReadMessage", async (request) => {
            request = JSON.parse(request);

            if (!(await databaseService.messageExists(request.id))) {
                socket.emit("error", {
                    opcode: 8,
                    message: "Message doesn't exists"
                });

                return;
            }

            let message = await databaseService.getMessage(request.id);

            if (message.read) {
                socket.emit("error", {
                    opcode: 12,
                    message: "This message has already been read"
                });

                return;
            } else if (message.receiver !== socket.data.user.uuid) {
                socket.emit("error", {
                    opcode: 10,
                    message: "You can't mark this message as read because you're not an receiver"
                });

                return;
            }

            await databaseService.markMessageAsRead(message._id);

            let receiver = findSocket(message.receiver);
            
            if (receiver) {
                receiver.emit("readMessage", {
                    _id: message._id
                });
            }
        });

        socket.on("typing", async (request) => {
            request = JSON.parse(request);

            let user = databaseService.getUserWithUUID(request.user);
            if (!user) {
                socket.emit("error", {
                    opcode: 2,
                    message: "User not found"
                });
                return;
            } else if (request.seconds < 1 || request.seconds > 10) {
                socket.emit("error", {
                    opcode: 13,
                    message: "Typing can go for at least 1 second and no more than 10 seconds"
                });

                return;
            } else if (!databaseService.hasConversationWith(request.user, socket.data.user.uuid)) {
                socket.emit("error", {
                    opcode: 18,
                    message: "User didn't created conversation with you"
                });

                return;
            }

            let receiver = findSocket(user.uuid);

            if (receiver) {
                receiver.emit("userTyping", {
                    user: socket.data.user.uuid,
                    seconds: request.seconds
                });
            }
        });

        socket.on("changeStatus", (request) => {
            request = JSON.parse(request);
            
            if (!(request.status in ["online", "do not disturb", "hidden"])) {
                socket.emit("error", {
                    opcode: 7,
                    message: "There's only three types of status: online, do not disturb and hidden"
                });

                return;
            } else if (socket.data.user.status === request.status) {
                return;
            }

            databaseService.updateUserStatus(socket.data.user.uuid, request.status);
            socket.data.user.status = request.status

            let status = request.status === "hidden" ? "offline" : request.status;

            io.in(socket.data.uuid).emit("status", status);
        });
    });

    io.listen(ioPort)
    
    /**
     * 
     * @param {import("crypto").UUID} uuid 
     * @returns {Socket}
     */
    async function findSocket(uuid) {
        const socket = (await io.fetchSockets()).filter(ioSocket => {
            if (ioSocket.data.user.uuid === uuid) {
                return ioSocket
            }
        });

        return socket ? socket[0] : null;
    }
}