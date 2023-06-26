export function generateId() {
    const chars = '1234567890'
    const rand = (min = 0, max = 1000) => Math.floor(Math.random() * (max - min) + min);
    const randchars = []
    for (let i = 0; i < 50; i++) {
        randchars.push(chars[rand(0, chars.length)]);
    }

    return randchars.join('');
}

export class Message {

    constructor(data) {
        this.data = data

        this._id = data._id
        this.content = data.content
        this.type = "message"
        this.author = data.author
        this.receiver = data.receiver
        this.datetime = new Date(data.datetime * 1000);
        this.editDatetime = data.datetime ? new Date(data.editDatetime * 1000) : null;
        this.read = data.read
    }

}