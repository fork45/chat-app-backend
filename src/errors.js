import { Socket } from "socket.io";

export class ClientError extends Error {

    /**
     * 
     * @param {import("express").Request | Socket} request 
     * @param {number} status 
     * @param {ErrorResponse} response 
     * @param {string | undefined} message 
     */
    constructor(request, status, response, message=undefined) {
        if (request instanceof Request) {
            this.request = request

            request.res.status(status).json(response);
        } else if (request instanceof Socket) {
            this.socket = socket

            this.socket.emit("error", response)
        }

        super(message);
    }

}

export class NoToken extends ClientError {
    
    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 401, {
            opcode: 0,
            message: "No Token in request header"
        });
    }

}

export class InvalidToken extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 401, {
            opcode: 1,
            message: "Invalid Token"
        });
    }

}

export class UserNotFound extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 404, {
            opcode: 2,
            message: "User not found"
        });
    }

}

export class InvalidMessageLength extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 3,
            message: "Your message must be no longer than 900 letters and not less than 1 letter"
        });
    }

}

export class InvalidNicknameOrNameLength extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 4,
            message: "Your nickname or name must be no longer than 255 letters and no less than 4 letters"
        });
    }

}

export class InvalidPasswordLength extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 5,
            message: "Password length should be long than 8 characters"
        });
    }

}

export class NameDoesNotMatchRegex extends ClientError {

    /**
     * 
     * @param {Request} request 
     */
    constructor(request) {
        this.regex = new RegExp("^[a-zA-Z0-9_-]+$");
        super(request, 400, {
            opcode: 6,
            message: `Your name does not match this regex: ${this.regex.source}`
        });
    }

}

export class InvalidStatus extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        this.allowedStatuses = ["online", "do not disturb", "hidden"]
        super(request, 400, {
            opcode: 7,
            message: `Invalid status, There are only these statuses: ${this.allowedStatuses.join(", ")}`
        });
    }
    
}

export class MessageDoesNotExists extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 404, {
            opcode: 8,
            message: "Message doesn't exists"
        });
    }

}

export class CannotEditMessage extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 403, {
            opcode: 9,
            message: "You can't edit this message because you're not an author"
        });
    }

}

export class CannotMarkAsReadMessage extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 10,
            message: "You can't mark as read this message because you're not an receiver"
        });
    }

}

export class CannotDeleteMessage extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 403, {
            opcode: 11,
            message: "You can't delete this message because you're not an author"
        });
    }

}

export class MessageAlreadyRead extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 12,
            message: "This message has already been read"
        });
    }

}

export class InvalidLimit extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 13,
            message: "Limit should be more than 1 and less than 100"
        });
    }

}

export class AlreadyHasConversation extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 14,
            message: "You already have conversation with this user"
        });
    }

}

export class NoConversation extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 404, {
            opcode: 15,
            message: "You don't have conversation with this user"
        });
    }

}

export class InvalidRSAKey extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 16,
            message: "Invalid RSA key"
        });
    }

}

export class DidNotCreatedConversation extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 17,
            message: "User didn't created conversation with you"
        });
    }

}

export class AlreadySentRSAKey extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 18,
            message: "You already sent RSA Key"
        });
    }

}

export class IncorrectPassword extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 19,
            message: "Incorrect password"
        });
    }

}

export class InvalidAvatarSize extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 20,
            message: "Avatar can't be empty or bigger than 10 megabytes"
        });
    }

}

export class AvatarCanBeOnlyPngOrJpeg extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 400, {
            opcode: 21,
            message: "Avatar can be only png or jpeg"
        });
    }

}

export class AvatarNotFound extends ClientError {

    /**
     * 
     * @param {import("express").Request | Socket} request
     */
    constructor(request) {
        super(request, 404, {
            opcode: 22,
            message: "Avatar not found"
        });
    }

}

/**
 * @typedef {Object} ErrorResponse
 * @property {number} opcode
 * @property {string} message
 */