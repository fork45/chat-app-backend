function generateId() {
    const chars = '1234567890';
    const rand = (min = 0, max = 1000) => Math.floor(Math.random() * (max - min) + min);
    const randchars = [];
    for (let i = 0; i < 50; i++) {
        randchars.push(chars[rand(0, chars.length)]);
    }

    return randchars.join('');
}