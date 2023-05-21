| Code | Description | HTTP Status |
| ---- | ----------- | ----------- |
| 0    | No token in request header| 401
| 1    | Invalid Token | 401       |
| 2    | Receiver/User not found | 404  |
| 3    | Your message must be no longer than 900 letters and not less than 1 letter | 400 |
| 4    | Your nickname or name must be no longer than 255 letters and no less than 4 letters | 400 |
| 5    | Password length should be long than 8 characters | 400 |
| 6    | Your name does not match this regex: ^[a-zA-Z0-9_-]+$ | 400
| 7    | Invalid status, there's only three statuses: online, do not disturb, hidden | 400
| 8    | Message doesn't exists    | 404
| 9    | You can't edit/mark as read this message because you're not an author/receiver | 403
| 10   | This message has already been read | 400
| 11   | Typing can go for at least 1 second and no more than 10 seconds | 400
| 12   | Limit should be more than 1 and less than 100 | 400
| 13   | You already have conversation with this user | 400
| 14   | You don't have conversation with this user | 404