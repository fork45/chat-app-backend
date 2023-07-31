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

    response.json(user.data);
});

httpServer.delete("/@me", async (request, response) => {
    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    if (!request.body.password)
        return new errors.IncorrectPassword(request);

    let [successful, message] = await databaseService.login(user.name, request.body.password);

    if (!successful)
        return new errors.IncorrectPassword(request);

    await databaseService.deleteUser(user.uuid);

    await storage.deleteAvatar(user.avatar);

    response.sendStatus(204);
    
    for (const conversationUser in user.conversationsWith) {
        let socket = await findSocket(conversationUser);

        if (socket) {
            socket.emit("userDelete", {user: user.uuid});
        }
    }
});

httpServer.patch("/@me/nickname", async (request, response) => {
    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    if (!request.body.nickname || (request.body.nickname.length > 255 || request.body.nickname.length <= 3))
        return new errors.InvalidNicknameOrNameLength(request);
    else if (!databaseService.checkNickname(request.body.nickname))
        return new errors.NameOrNicknameDoesNotMatchRegex(request);

    await databaseService.changeNickname(user.uuid, request.body.nickname);
    
    response.sendStatus(204);

    io.in(user.uuid).emit("nicknameChange", {
        user: user.uuid,
        nickname: request.body.nickname
    });
});

httpServer.patch("/@me/password", async (request, response) => {
    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    if (!request.body.password)
        return new errors.IncorrectPassword(request);

    let [successful, message] = await databaseService.login(user.name, request.body.password);

    if (!successful)
        return new errors.IncorrectPassword(request);

    let token = await databaseService.changePassword(user.uuid, request.body.new);

    response.json({
        token: token
    });
})

httpServer.post("/accounts", async (request, response) => {
    if ((request.body.nickname.length > 255 || request.body.nickname.length <= 3) || (request.body.name.length > 255 || request.body.name.length <= 3))
        return new errors.InvalidNicknameOrNameLength(request);
    else if (request.body.password.length < 8)
        return new errors.InvalidPasswordLength(request);

    let user = await databaseService.addUser(request.body.nickname, request.body.name, request.body.password);
    
    if (user === false)
        return new errors.NameOrNicknameDoesNotMatchRegex(request);

    response.json({
        id: user.uuid,
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

    let [user, token] = await databaseService.login(name, password);

    if (token === "no user") {
        new errors.UserNotFound(request);

        return;
    } else if (token === "incorrect password") {
        new errors.IncorrectPassword(request);

        return;
    }

    let data = user.generateSecureJson();
    data.token = token

    response.json(data);
});

httpServer.post("/avatars", async (request, response) => {
    if (!request.file)
        return new errors.InvalidAvatarSize(request);
    else if (request.file.mimetype !== "image/png" || request.file.mimetype !== "image/jpeg")
        return new errors.AvatarCanBeOnlyPngOrJpeg(request);
    else if (request.file.size > 10000000 || request.file.size === 0)
        return new errors.InvalidAvatarSize(request);

    const metadata = await sharp(request.file.buffer).metadata();
    if (metadata.format !== "jpeg" || metadata.format !== "png")
        return new errors.AvatarCanBeOnlyPngOrJpeg(request);

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

    io.in(author.uuid).emit("avatarChange", { user: author.uuid, hash: hash });
});

httpServer.get("/avatars/:hash", async (request, response) => {
    if (!request.params.hash)
        return new errors.AvatarNotFound(request);

    const avatar = await storage.getAvatar(request.params.hash);

    if (!avatar)
        return new errors.AvatarNotFound(request);

    response.setHeader("Content-disposition", "attachment; filename=" + request.params.hash);
    response.type(avatar.ContentType).send(avatar.Body);
});

httpServer.get("/conversations/:user", async (request, response) => {
    if (!request.params.user)
        return new errors.UserNotFound(request);
    
    try {
        var author = await checkRequester(request);
    } catch {
        return;
    }

    if (!(await databaseService.hasConversationWith(request.params.user, author.uuid)))
        return new errors.DidNotCreatedConversation(request);

    let user = await databaseService.getUserWithUUID(request.params.user);

    if (!user)
        return new errors.UserNotFound(request);

    let data = user.data;
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
    if (!request.body.key)
        return new errors.InvalidRSAKey(request);
    
    try {
        var author = await checkRequester(request);
    } catch (error) {
        return;
    }

    try {
        crypto.publicEncrypt(request.body.key, Buffer.from("TestRsaCryptoMessagePublicKeyDescryptVerification1234567890$%^&*()!@#/|-/|<>?.,;"));
    } catch (error) {
        return new errors.InvalidRSAKey(request);
    }

    let user = await databaseService.getUserWithName(request.body.user);

    if (!user)
        return new errors.UserNotFound(request);
    else if (await databaseService.hasConversationWith(user.uuid, author.uuid))
        return new errors.AlreadyHasConversation(request);

    await databaseService.addConversationToUser(author.uuid, user.uuid);
    await databaseService.sendKey(author.uuid, user.uuid, request.body.key);

    user = await findSocket(user.uuid)
    
    if (user) {
        user.emit("newConversation", {
            user: author.uuid
        });
    }

    let authorSocket = findSocket(author);

    if (authorSocket) {
        let status = authorSocket ? (authorSocket.data.status === "hidden" ? "offline" : authorSocket.data.status) : "offline"
        authorSocket.emit("status", { status: status });
    }

    response.sendStatus(204);
});

httpServer.delete("/conversations/:user", async (request, response) => {
    if (!request.params.user)
        return new errors.UserNotFound(request);

    try {
        var author = await checkRequester();
    } catch (error) {
        return;
    }

    let user = await databaseService.getUserWithUUID(request.params.user);

    if (!user)
        return new errors.UserNotFound(request);
    else if (!(await databaseService.hasConversationWith(user.uuid, author.uuid)))
        return new errors.NoConversation(request);

    await databaseService.removeConversationFromUser(author.uuid, user.uuid);
    await databaseService.removeConversationFromUser(user.uuid, author.uuid);

    await databaseService.deleteMessagesInConversation(author.uuid, user.uuid);

    let socket = await findSocket(user.uuid);

    if (socket) {
        socket.emit("conversationDelete", {
            user: author.uuid
        });
    }

    response.sendStatus(204);
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

    response.sendStatus(204);
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
    if (!request.params.user)
        return new errors.UserNotFound(request);
    
    if (!request.query.limit || request.query.limit <= 101 || request.query.limit <= 0) {
        request.body.limit = 50
    }

    if (request.body.limit < 1 || request.body.limit > 100)
        return new errors.InvalidLimit(request);

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let interlocutor = await databaseService.getUserWithUUID(request.params.user);

    if (!interlocutor)
        return new errors.UserNotFound(request);

    if (!await databaseService.hasConversationWith(interlocutor.uuid, user.uuid))
        return new errors.NoConversation(request);

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
    if (!request.params.message)
        return new errors.MessageDoesNotExists(request);
    
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

    if (!await databaseService.hasConversationWith(user.uuid, author.uuid)) {
        new errors.NoConversation(request);
        
        return;
    }

    const id = generateId();

    await databaseService.addMessage(id, author.uuid, userUUID, request.body.content);

    let socket = await findSocket(userUUID);

    if (socket) {
        socket.emit("newMessage", {
            id: id,
            user: author.uuid,
            content: request.body.content
        });
    }

    response.status(200).json({
        id: id
    });
});

httpServer.delete("/messages/:message", async (request, response) => {
    if (!request.params.message)
        return new errors.MessageDoesNotExists(request);

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let message = await databaseService.getMessage(request.params.message);
    
    if (!message)
        return new errors.MessageDoesNotExists(request);
    else if (message.author !== user.uuid)
        return new errors.CannotDeleteMessage(request);

    await databaseService.deleteMessage(request.params.message);

    let socket = await findSocket(message.receiver);

    if (socket) {
        socket.emit("deleteMessage", {
            user: user.uuid,
            id: message.id
        });
    }

    response.sendStatus(204);
});

httpServer.post("/:user/messages/purge", async (request, response) => {
    if (request.body.messages.length > 100 || request.body.messages.length < 2)
        return new errors.InvalidMessagesNumber(request);

    try {
        var user = await checkRequester(request);
    } catch (error) {
        return;
    }

    let interlocutor = await databaseService.getUserWithUUID(request.params.user);
    if (!interlocutor)
        return new errors.UserNotFound(request);

    for (let index = 0; index < request.body.messages.length; index++) {
        let message = await databaseService.getMessage(request.body.messages[index]);

        if (!message)
            return new errors.InvalidMessageId(request, request.body.messages[index]);
        else if (message.author !== user.uuid)
            return new errors.CannotDeleteMessage(request);

        await databaseService.deleteMessage(request.body.messages[index]);
    }
    
    response.sendStatus(204);

    interlocutor = findSocket(interlocutor.uuid);

    if (interlocutor) {
        interlocutor.emit("deleteMessages", {
            messages: request.body.messages
        });
    }
});

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
    
    if (!message)
        return new errors.MessageDoesNotExists(request);
    else if (!receiver)
        return new errors.UserNotFound(request);
    else if (message.author !== user.uuid)
        return new errors.CannotEditMessage(request);
    
    await databaseService.editMessage(message.id, request.body.content);

    let socket = await findSocket(receiver.uuid);

    if (socket) {
        socket.emit("messageEdit", {
            id: message.id,
            content: request.body.content
        });
    }

    response.sendStatus(204);
});

httpServer.get("*", (request, response) => {
    response.sendStatus(404);
});

io.on("connection", async (socket) => {
    socket.data.token = socket.handshake.auth["token"]
    socket.data.user = await databaseService.getUserWithToken(socket.data.token, true);
    
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
        socket.join(user.id);
    });

    socket.emit("ready");

    socket.on("disconnect", async (reason) => {
        io.in(socket.data.user.uuid).emit("status", { "status": "offline" });
        
        await databaseService.changeLastExitTime(socket.data.user.uuid);
    });

    socket.on("markMessageRead", async (request) => {
        if (!(await databaseService.messageExists(request.id)))
            return new errors.MessageDoesNotExists(socket);

        let message = await databaseService.getMessage(request.id);

        if (message.read)
            return new errors.MessageAlreadyRead(socket);
        else if (message.receiver !== socket.data.user.uuid)
            return new errors.CannotMarkAsReadMessage(socket);

        await databaseService.markMessageAsRead(message.id);

        let author = await findSocket(message.author);
        
        if (author) {
            author.emit("readMessage", {
                id: message.id
            });
        }
    });

    socket.on("typing", async (request) => {
        let user = await databaseService.getUserWithUUID(request.user);
        if (!user)
            return new errors.UserNotFound(socket);
        else if (!(await databaseService.hasConversationWith(request.user, socket.data.user.uuid)))
            return new errors.DidNotCreatedConversation(socket);

        let receiver = await findSocket(user.uuid);

        if (receiver) {
            receiver.emit("userTyping", {
                user: socket.data.user.uuid,
            });
        }
    });

    socket.on("changeStatus", async (request) => {
        if (!(["online", "do not disturb", "hidden"].includes(request.status)))
            return new errors.InvalidStatus(socket);
        else if (socket.data.user.status === request.status)
            return;

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
 * @param {boolean} [full=false] 
 * @returns {null | User}
 */
async function checkRequester(request, checkInDatabase = true, full=false) {
    if (!request.header("authorization")) {
        throw new errors.NoToken(request);
    }

    if (checkInDatabase) {
        let user = await databaseService.getUserWithToken(request.header("authorization"), full);

        if (!user) {
            throw new errors.InvalidToken(request);
        }

        return user;
    }
}