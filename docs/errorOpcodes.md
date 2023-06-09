| Code | Description | HTTP Status |
| ---- | ----------- | ----------- |
| 0    | No token in request header| 401
| 1    | Invalid Token             | 401
| 2    | Receiver/User not found   | 404  |
| 3    | Your message must be no longer than 900 letters and not less than 1 letter | 400 |
| 4    | Your nickname or name must be no longer than 255 letters and no less than 4 letters | 400 |
| 5    | Password length should be long than 8 characters | 400 |
| 6    | Your name does not match this regex: ^[a-zA-Z0-9_-]+$ | 400
| 7    | Invalid status, there's only three statuses: online, do not disturb, hidden | 400
| 8    | Message doesn't exists    | 404
| 9    | You can't edit this message because you're not an author | 403
| 10   | You can't mark as read this message because you're not a receiver | 400
| 11   | You can't delete this message because you're not an author | 403
| 12   | This message has already been read | 400
| 13   | Typing can go for at least 1 second and no more than 10 seconds | 400
| 14   | Limit should be more than 1 and less than 100 | 400
| 15   | You already have conversation with this user | 400
| 16   | You don't have conversation with this user | 404
| 17   | Invalid RSA key           | 400
| 18   | User didn't created conversation with you | 400
| 19   | You already sent RSA key  | 400
| 20   | Avatar file can't be larger than 10 megabytes | 400
| 21   | Avatar not found | 404
| 22   | Avatar can be only jpeg or png | 400
| 23   | You can't send empty file to server | 400