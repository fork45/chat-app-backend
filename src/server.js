import express from "express";
import { Server, Socket } from "socket.io";
import { DatabaseService } from "./models/database.js";
import { generateId } from "./models/messages.js";
import crypto from "crypto";

export default function run(serverPort, ioPort, dbConnectUri) {
    const httpServer = express()
    const io = new Server()
    const databaseService = new DatabaseService(dbConnectUri);

    httpServer.use(express.json());

    httpServer.get("/@me", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        response.json(author.generateSecureJson());
    });

    httpServer.post("/accounts", async (request, response) => {
        if ((request.body.nickname.length > 255 || request.body.nickname.length <= 3) || (request.body.name.length > 255 || request.body.name.length <= 3)) {
            response.status(400).json({
                opcode: 4,
                message: "Your nickname or name must be no longer than 255 letters and no less than 4 letters"
            });
            
            return;
        } else if (request.body.password.length < 8) {
            response.status(400).json({
                opcode: 5,
                message: "Password length should be long than 8 characters"
            });

            return;
        }

        let user = await databaseService.addUser(request.body.nickname, request.body.name, request.body.password);
        
        if (user === false) {
            response.status(400).json({
                opcode: 6,
                message: "Your name does not match this regex: ^[a-zA-Z0-9_-]+$"
            });

            return;
        }

        response.json({
            _id: user.uuid,
            name: user.name,
            nickname: user.nickname,
            token: user.token
        });
    });

    httpServer.get("/login", async (request, response) => {
        const name = request.body.name
        const password = request.body.password

        let [token, user] = await databaseService.login(name, password);

        if (user === "no user") {
            response.status(400).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        } else if (user === "incorrect password") {
            response.status(400).json({
                opcode: 20,
                message: "Incorrect password"
            });

            return;
        }

        let data = user.generateSecureJson();
        data.token = token

        response.json(data);
    });

    httpServer.get("/conversations/:user", async (request, response) => {
        if (!request.params.user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        }
        
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        } else if (!(await databaseService.hasConversationWith(request.params.user, author.uuid))) {
            response.status(400).json({
                opcode: 18,
                message: "User didn't created conversation with you"
            });

            return;
        }

        let user = await databaseService.getUserWithUUID(request.params.user);

        if (!user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        }

        let data = user.generateSecureJson();

        response.status(200).json(data);
    });

    httpServer.get("/conversations", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let user = await databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        let users = await databaseService.getUserConversationsWith(user.uuid);

        response.status(200).json(users);
    });

    httpServer.post("/conversations", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }
        
        if (!request.body.key) {
            response.status(400).json({
                opcode: 17,
                message: "Invalid RSA Key"
            });

            return;
        }

        try {
            crypto.publicEncrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
        } catch (error) {
            response.status(400).json({
                opcode: 17,
                message: "Invalid RSA Key"
            })

            return;
        }

        let user = await databaseService.getUserWithName(request.body.user);

        if (!user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        } else if (await databaseService.hasConversationWith(user.uuid, author.uuid)) {
            response.status(400).json({
                opcode: 15,
                message: "You already have conversation with this user"
            });

            return;
        }

        await databaseService.addConversationToUser(author.uuid, user.uuid);
        await databaseService.sendKey(author.uuid, user.uuid, request.body.key);

        findSocket(user.uuid)
            .then(socket => {
                if (socket) {
                    socket.emit("newConversation", {
                        user: author.uuid
                    });
                }
            });

        let authorSocket = findSocket(author)
            .then(socket => {
                if (socket) {
                    let status = socket ? (socket.data.status === "hidden" ? "offline" : socket.data.status) : "offline"
                    authorSocket.emit("status", { status: status });
                }
            });

        response.status(204).send();
    });

    httpServer.delete("/conversations/:user", async (request, response) => {
        if (!request.params.user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        }

        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        let user = await databaseService.getUserWithUUID(request.params.user);

        if (!user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        } else if (!(await databaseService.hasConversationWith(user.uuid, author.uuid))) {
            response.status(404).json({
                opcode: 16,
                message: "You don't have conversation with this user"
            });

            return;
        }

        await databaseService.removeConversationFromUser(author.uuid, user.uuid);
        await databaseService.removeConversationFromUser(user.uuid, author.uuid);

        await databaseService.deleteMessagesInConversation(author.uuid, user.uuid);

        let socket = await findSocket(user.uuid);

        if (socket) {
            socket.emit("conversationDelete", {
                user: author.uuid
            });
        }

        response.status(204).send();
    });

    httpServer.post("/key", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }

        try {
            crypto.publicEncrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
        } catch (error) {
            response.status(400).json({
                opcode: 17,
                message: "Invalid RSA Key"
            });

            console.log(error)
            return;
        }

        let userName = request.body.user
        let user = await databaseService.getUserWithName(userName);

        if (!user) {
            response.status(404).json({
                opcode: 2,
                message: "Receiver not found"
            });

            return;
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            })

            return;
        }

        let ready = await databaseService.conversationReady(author.uuid, user.uuid)

        if (ready === null) {
            await response.status(400).json({
                opcode: 18,
                message: "User didn't created conversation with you"
            });

            return;
        } else if (ready === true) {
            await response.status(400).json({
                opcode: 19,
                message: "You already sent RSA key"
            });

            return;
        }

        await databaseService.addConversationToUser(author.uuid, user.uuid);
        await databaseService.sendKey(author.uuid, user.uuid, request.body.key);

        let socket = await findSocket(user.uuid);

        if (socket) {
            socket.emit("conversationKey", {
                key: request.body.key,
                user: user.uuid
            });
        }

        response.status(204).send();
    });

    httpServer.get("/messages/:user", async (request, response) => {
        if (!request.params.user) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        }
        
        if (!request.query.limit) {
            request.body.limit = 50
        }

        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        } else if (request.body.limit < 1 || request.body.limit > 100) {
            response.status(400).json({
                opcode: 14,
                message: "Limit should be more than 1 and less than 100"
            });

            return;
        }

        let user = await databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            });

            return;
        }

        let interlocutor = await databaseService.getUserWithUUID(request.params.user);

        if (!interlocutor) {
            response.status(404).json({
                opcode: 2,
                message: "User not found"
            });

            return;
        }
        let messages = [];

        if (request.query.after) {
            messages = await databaseService.getUserMessagesAfterMessage(user.uuid, interlocutor.uuid, request.body.after, request.body.limit);
            
            if (messages === false) {
                response.status(404).json({
                    opcode: 8,
                    message: "Message doesn't exists"
                });

                return;
            }
        } else {
            messages = await databaseService.getUserMessages(user.uuid, interlocutor.uuid, request.body.limit);
        }

        response.status(200).json(messages);
    });

    httpServer.post("/messages", async (request, response) => {
        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });
            
            return;
        } else if (request.body.content.length > 1200 || request.body.content.length <= 0) {
            response.status(400).json({
                opcode: 3,
                message: "Your message must be no longer than 900 letters and not less than 1 letter"
            })
        }

        let author = await databaseService.getUserWithToken(request.headers.authorization);

        if (!author) {
            await response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let receiverUuid = request.body.receiver
        let receiver = await databaseService.getUserWithUUID(receiverUuid);

        if (!receiver) {
            response.status(404).json({
                opcode: 2, 
                message: "Receiver not found"
            });
            return;
        }

        const id = generateId();

        databaseService.addMessage(id, author.uuid, receiverUuid, request.body.content);

        let socket = await findSocket(receiverUuid);

        if (socket) {
            socket.emit("newMessage", {
                _id: id,
                user: author.uuid,
                content: request.body.content
            });
        }

        response.status(200).json({
            _id: id
        });
    });

    httpServer.delete("/messages/:message", async (request, response) => {
        if (!request.params.message) {
            response.status(404).json({
                opcode: 8,
                message: "Message doesn't exists"
            });

            return;
        }

        if (!request.header("authorization")) {
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        }
        
        let user = await databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let message = await databaseService.getMessage(request.params.message);
        let receiver = await databaseService.getUserWithUUID(message.receiver);
        
        if (!message) {
            response.status(404).json({
                opcode: 8,
                message: "Message doesn't exists"
            });

            return;
        } else if (message.author !== user.uuid) {
            response.status(403).json({
                opocode: 11,
                message: "You can't delete this message because you're not an author"
            });

            return;
        }

        await databaseService.deleteMessage(request.params.message);

        let socket = await findSocket(receiver.uuid);

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
            response.status(401).json({
                opcode: 0,
                message: "No token in request header"
            });

            return;
        } else if (request.body.content.length > 1200 || request.body.content.length <= 0) {
            response.status(400).json({
                opcode: 3,
                message: "Your message must be no longer than 900 letters and not less than 1 letter"
            })
        }

        let user = await databaseService.getUserWithToken(request.headers.authorization);

        if (!user) {
            response.status(401).json({
                opcode: 1,
                message: "Invalid Token"
            })
            return;
        }

        let message = await databaseService.getMessage(request.body.id);
        let receiver = await databaseService.getUserWithUUID(message.receiver);
        
        if (!message) {
            response.status(404).json({
                opcode: 8,
                message: "Message doesn't exists"
            });

            return;
        } else if (!receiver) {
            response.status(404).json({
                opcode: 2,
                message: "Receiver not found"
            });

            return;
        } else if (message.author !== user.uuid) {
            response.status(403).json({
                opcode: 9,
                message: "You can't edit this message because you're not an author"
            });
            
            return;
        }
        
        await databaseService.editMessage(message._id, request.body.content);

        let socket = await findSocket(receiver.uuid);

        if (socket) {
            socket.emit("editMessage", {
                _id: message._id,
                content: request.body.content
            });
        }

        response.status(204).send();
    });

    httpServer.listen(serverPort, () => {
        console.log(`HTTP is listening on port ${serverPort}\nSocket.io is listening on port ${ioPort}`)
    });

    io.on("connection", async (socket) => {
        socket.data.token = socket.handshake.auth["token"]
        socket.data.user = await databaseService.getUserWithToken(socket.data.token)
        
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

            if (friend) socket.emit("friendStatus", {
                user: friend.data.user.uuid,
                status: friendStatus
            });
        });

        let status = socket.data.user.status === "hidden" ? "offline" : socket.data.user.status;

        io.in(socket.data.user.uuid).emit("status", {
            user: socket.data.user.uuid,
            status: status
        });

        let users = await databaseService.getUserConversationsWith(socket.data.user.uuid);
        
        users.forEach(user => {
            socket.join(user);
        });

        socket.emit("ready");

        socket.on("disconnect", async (reason) => {
            io.in(socket.data.user.uuid).emit("status", { "status": "offline" });
            
            await databaseService.changeLastExitTime(socket.data.user.uuid);
        });

        socket.on("markMessageRead", async (request) => {
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

            let author = await findSocket(message.author);
            
            if (author) {
                author.emit("readMessage", {
                    _id: message._id
                });
            }
        });

        socket.on("typing", async (request) => {
            let user = await databaseService.getUserWithUUID(request.user);
            if (!user) {
                socket.emit("error", {
                    opcode: 2,
                    message: "User not found"
                });
                return;
            } else if (!(await databaseService.hasConversationWith(request.user, socket.data.user.uuid))) {
                socket.emit("error", {
                    opcode: 18,
                    message: "User didn't created conversation with you"
                });

                return;
            }

            let receiver = await findSocket(user.uuid);

            if (receiver) {
                receiver.emit("userTyping", {
                    user: socket.data.user.uuid,
                });
            }
        });

        socket.on("changeStatus", async (request) => {
            if (!(["online", "do not disturb", "hidden"].includes(request.status))) {
                socket.emit("error", {
                    opcode: 7,
                    message: "There's only three types of status: online, do not disturb and hidden"
                });

                return;
            } else if (socket.data.user.status === request.status) {
                return;
            }

            await databaseService.updateUserStatus(socket.data.user.uuid, request.status);
            socket.data.user.status = request.status

            let status = request.status === "hidden" ? "offline" : request.status;

            io.in(socket.data.user.uuid).emit("status", {
                user: socket.data.user.uuid,
                status: status
            });
        });
    });

    io.listen(ioPort)
    
    /**
     * 
     * @param {import("crypto").UUID} uuid 
     * @returns {Promise<Socket>}
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