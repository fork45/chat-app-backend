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
| 9    | You can't edit this message because you're not an author | 403