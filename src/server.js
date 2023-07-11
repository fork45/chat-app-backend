import express from "express";
import dotenv from "dotenv";
import { Server, Socket } from "socket.io";
import { DatabaseService } from "./models/database.js";
import { generateId } from "./models/messages.js";
import * as errors from "./errors.js";
import crypto from "crypto";
import { StorageService } from "./models/storage.js";
import sharp from "sharp";

dotenv.config();
export const httpServer = express();
export const io = new Server();
const databaseService = new DatabaseService(process.env.dbConnectUri);
const storage = new StorageService(process.env.accessKeyId, process.env.secretAccessKey, {
    avatars: process.env.avatarsBucket
});

httpServer.use(express.json());

httpServer.get("/@me", async (request, response) => {
    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    response.json(user.generateSecureJson());
});

httpServer.post("/accounts", async (request, response) => {
    if ((request.body.nickname.length > 255 || request.body.nickname.length <= 3) || (request.body.name.length > 255 || request.body.name.length <= 3)) {
        new errors.InvalidNicknameOrNameLength(request);

        return;
    } else if (request.body.password.length < 8) {
        new errors.InvalidPasswordLength(request);

        return;
    }

    let user = await databaseService.addUser(request.body.nickname, request.body.name, request.body.password);
    
    if (user === false) {
        new errors.NameDoesNotMatchRegex(request);

        return;
    }

    response.json({
        _id: user.uuid,
        name: user.name,
        nickname: user.nickname,
        token: user.token
    });
});

httpServer.get("/login/:name/:password", async (request, response) => {
    if (!request.params.name) {
        new errors.UserNotFound(request);

        return;
    } else if (!request.params.password) {
        new errors.IncorrectPassword(request);

        return;
    }

    const name = request.params.name
    const password = request.params.password

    let [token, user] = await databaseService.login(name, password);

    if (user === "no user") {
        new errors.UserNotFound(request);

        return;
    } else if (user === "incorrect password") {
        new errors.IncorrectPassword(request);

        return;
    }

    let data = user.generateSecureJson();
    data.token = token

    response.json(data);
});

httpServer.post("/avatars", async (request, response) => {
    if (!request.file) {
        new errors.InvalidAvatarSize(request);

        return;
    } else if (request.file.mimetype !== "image/png" || request.file.mimetype !== "image/jpeg") {
        new errors.AvatarCanBeOnlyPngOrJpeg(request);

        return;
    } else if (request.file.size > 10000000 || request.file.size === 0) {
        new errors.InvalidAvatarSize(request);

        return;
    }

    const metadata = await sharp(request.file.buffer).metadata();
    if (metadata.format !== "jpeg" || metadata.format !== "png") {
        new errors.AvatarCanBeOnlyPngOrJpeg(request);

        return;
    }

    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }

    let avatar = author.avatar
    if (avatar)
        await storage.deleteAvatar(avatar);

    let [responseAvatar, hash] = await storage.saveAvatar(request.file);

    await databaseService.setAvatar(author.uuid, hash);

    response.status(200).send({
        hash: hash
    });

    io.in(author.uuid).emit("avatarChange", { hash: hash });
});

httpServer.get("/avatars/:hash", async (request, response) => {
    if (!request.params.hash) {
        new errors.AvatarNotFound(request);
        
        return;
    }

    const avatar = await storage.getAvatar(request.params.hash);

    if (!avatar) {
        new errors.AvatarNotFound(request);

        return;
    }

    response.setHeader("Content-disposition", "attachment; filename=" + request.params.hash);
    response.type(avatar.ContentType).send(avatar.Body);
});

httpServer.get("/conversations/:user", async (request, response) => {
    if (!request.params.user) {
        new errors.UserNotFound(request);

        return;
    }
    try {
        var author = await checkRequester(request);
    } catch {
        return;
    }

    if (!(await databaseService.hasConversationWith(request.params.user, author.uuid))) {
        new errors.DidNotCreatedConversation(request);

        return;
    }

    let user = await databaseService.getUserWithUUID(request.params.user);

    if (!user) {
        new errors.UserNotFound(request);

        return;
    }

    let data = user.generateSecureJson();
    data.lastMessage = await databaseService.getLastMessageInConversation(user.uuid);

    response.status(200).json(data);
});

httpServer.get("/conversations", async (request, response) => {
    try {
        var user = await checkRequester(request);
    } catch {
        return;
    }

    let users = await databaseService.getUserConversationsWith(user.uuid);

    response.status(200).json(users);
});

httpServer.post("/conversations", async (request, response) => {
    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }
    
    if (!request.body.key) {
        new errors.InvalidRSAKey(request);

        return;
    }

    try {
        crypto.publicEncrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
    } catch (error) {
        new errors.InvalidRSAKey(request);

        return;
    }

    let user = await databaseService.getUserWithName(request.body.user);

    if (!user) {
        new errors.UserNotFound(request);

        return;
    } else if (await databaseService.hasConversationWith(user.uuid, author.uuid)) {
        new errors.AlreadyHasConversation(request);

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
        new errors.UserNotFound(request);

        return;
    }

    try {
        var author = await checkRequester();
    } catch (error) {
        return;
    }

    let user = await databaseService.getUserWithUUID(request.params.user);

    if (!user) {
        new errors.UserNotFound(request);

        return;
    } else if (!(await databaseService.hasConversationWith(user.uuid, author.uuid))) {
        new errors.NoConversation(request);

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
    try {
        crypto.publicEncrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
    } catch (error) {
        new errors.InvalidRSAKey(request);

        return;
    }

    let userName = request.body.user
    let user = await databaseService.getUserWithName(userName);

    if (!user) {
        new errors.UserNotFound(request);

        return;
    }

    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }

    let ready = await databaseService.conversationReady(author.uuid, user.uuid)

    if (ready === null) {
        new errors.DidNotCreatedConversation(request);

        return;
    } else if (ready === true) {
        new errors.AlreadySentRSAKey(request);

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

httpServer.get("/keys/:user", async (request, response) => {
    if (!request.params.user) 
        return new errors.UserNotFound(request);

    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }

    if (!(await databaseService.getUserWithUUID(request.params.user)))
        return new errors.UserNotFound
    else if (!(await databaseService.hasConversationWith(request.params.user, author)) || !(await databaseService.hasConversationWith(request.params.user, author)))
        return new errors.NoConversation(request);
    
    let key = await databaseService.getKey(request.params.user, author.uuid);

    response.json({key: key});
})

httpServer.get("/:user/messages", async (request, response) => {
    if (!request.params.user) {
        new errors.UserNotFound(request);

        return;
    }
    
    if (!request.query.limit || request.query.limit <= 101 || request.query.limit <= 0) {
        request.body.limit = 50
    }

    if (request.body.limit < 1 || request.body.limit > 100) {
        response.status(400).json({
            opcode: 14,
            message: "Limit should be more than 1 and less than 100"
        });

        return;
    }

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let interlocutor = await databaseService.getUserWithUUID(request.params.user);

    if (!interlocutor) {
        new errors.UserNotFound(request);

        return;
    }

    let messages = [];

    if (request.query.after) {
        messages = await databaseService.getUserMessagesAfterMessage(user.uuid, interlocutor.uuid, request.body.after, request.body.limit);
        
        if (messages === false) {
            new errors.MessageDoesNotExists(request);

            return;
        }
    } else {
        messages = await databaseService.getUserMessages(user.uuid, interlocutor.uuid, request.body.limit);
    }

    response.status(200).json(messages);
});

httpServer.get("/messages/:message", async (request, response) => {
    if (!request.params.message) return new errors.MessageDoesNotExists(request);
    
    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let message = await databaseService.getMessage(request.params.message);

    if (!message) return new errors.MessageDoesNotExists(request);

    if (message.author !== user.uuid || message.receiver !== user.uuid) 
        return new errors.MessageDoesNotExists(request);

    response.json(message);
});

httpServer.post("/messages", async (request, response) => {
    if (request.body.content.length > 1200 || request.body.content.length <= 0) {
        response.status(400).json({
            opcode: 3,
            message: "Your message must be no longer than 900 letters and not less than 1 letter"
        })
    }

    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }

    let userUUID = request.body.user
    let user = await databaseService.getUserWithUUID(userUUID);

    if (!user) {
        new errors.UserNotFound(request);

        return;
    }

    const id = generateId();

    await databaseService.addMessage(id, author.uuid, userUUID, request.body.content);

    let socket = await findSocket(userUUID);

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
        new errors.MessageDoesNotExists(request);

        return;
    }

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let message = await databaseService.getMessage(request.params.message);
    let receiver = await databaseService.getUserWithUUID(message.receiver);
    
    if (!message) {
        new errors.MessageDoesNotExists(request);

        return;
    } else if (message.author !== user.uuid) {
        new errors.CannotDeleteMessage(request);

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

httpServer.delete("/:user/messages/purge", (request, response) => {});

httpServer.patch("/messages", async (request, response) => {
    if (request.body.content.length > 1200 || request.body.content.length <= 0) {
        response.status(400).json({
            opcode: 3,
            message: "Your message must be no longer than 900 letters and not less than 1 letter"
        })
    }

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let message = await databaseService.getMessage(request.body.id);
    let receiver = await databaseService.getUserWithUUID(message.receiver);
    
    if (!message) {
        new errors.MessageDoesNotExists(request);

        return;
    } else if (!receiver) {
        new errors.UserNotFound(request);

        return;
    } else if (message.author !== user.uuid) {
        new errors.CannotEditMessage(request);
        
        return;
    }
    
    await databaseService.editMessage(message._id, request.body.content);

    let socket = await findSocket(receiver.uuid);

    if (socket) {
        socket.emit("messageEdit", {
            _id: message._id,
            content: request.body.content
        });
    }

    response.status(204).send();
});


httpServer.get("*", (request, response) => {
    response.sendStatus(404);
});

io.on("connection", async (socket) => {
    socket.data.token = socket.handshake.auth["token"]
    socket.data.user = await databaseService.getUserWithToken(socket.data.token)
    
    if (socket.data.user === undefined) {
        new errors.NoToken(socket);

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

        if (friend) socket.emit("status", {
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
            new errors.MessageDoesNotExists(socket);

            return;
        }

        let message = await databaseService.getMessage(request.id);

        if (message.read) {
            new errors.MessageAlreadyRead(socket);

            return;
        } else if (message.receiver !== socket.data.user.uuid) {
            new errors.CannotMarkAsReadMessage(socket);

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
            new errors.UserNotFound(socket);

            return;
        } else if (!(await databaseService.hasConversationWith(request.user, socket.data.user.uuid))) {
            new errors.DidNotCreatedConversation(socket);

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
            new errors.InvalidStatus(socket);

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

httpServer.listen(process.env.httpServerPort, () => {
    console.log(`HTTP is listening on port ${process.env.httpServerPort}\nSocket.io is listening on port ${process.env.socketServerPort}`)
});

io.listen(process.env.socketServerPort);

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

/**
 * 
 * @param {import("express").Request} request 
 * @param {boolean} checkInDatabase 
 * @returns {number | User}
 */
async function checkRequester(request, checkInDatabase = true) {
    if (!request.header("authorization")) {
        throw new errors.NoToken(request);
    }

    if (checkInDatabase) {
        let user = await databaseService.getUserWithToken(request.header("authorization"));

        if (!user) {
            throw new errors.InvalidToken(request);
        }

        return user;
    }
}