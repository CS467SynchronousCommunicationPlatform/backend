# Synchronous Communication Platform Backend

## API Reference

### socket.io API

#### Connection

The server has polling transport disabled and requires an auth token containing a user id for a connection to be accepted.

Using the socket.io client library this looks like the following, where `serverUrl` is the URL of the backend and `userId` is a valid user uuid.
```js
import { io } from "socket.io-client";
const socket = io(serverUrl, { auth: { token: userId }, transports: ["websocket"]});
```

On success, the backend will emit a "connected" event.

On failure, the backend will emit one of the following "error" events depending on the issue
- "Auth token not provided"
- "Auth token does not match a user"

#### Messaging

To send a chat message the client should emit a "chat" event with the following message structure
```js
{
    body: string,
    timestamp: timestamp string,
    channel_id: unsigned integer
}
```

If the user id in the socket auth token is a user on the provided channel, and the message structure is valid, the message will be sent, and the sender will receive the following "chat" event structure back
```js
{
    body: string,
    timestamp: timestamp string,
    channel_id: unsigned integer,
    user: string
}
```

Otherwise, the backend will emit one of the following "error" events depending on the issue with the provided "chat" structure
- "Chat message missing `<property>` property"
- "Chat message `<property>` property is not a `<property type>`"
- "Chat message "timestamp" is `<invalid timestamp>` which is not a valid timestamp"
- "Chat message "channel_id" is `<invalid channel_id>` which is not a valid channel"
- "Chat message user is not a member of the chat with "channel_id" value `<channel_id value>`"

#### Update Events

Whenever a user adds another user to a channel, a "channel" event with the following structure will be sent to that user
```
{
    message: "Added to channel",
    channelId: unsigned integer
}
```

Whenever a user updates their display name, a "displayname" event with the following structure will be sent to all users to inform them what the displayname used to be and what it is now
```
{
    "message": "User display name was updated"
    "previous": string,
    "new": string
}
```


### REST API

#### Structures

Channel
```json
{
    "id": unsigned integer,
    "name": string,
    "created_at": timestamp string,
    "description": string,
    "private": boolean
}
```

User
```json
{
    "id": uuid string,
    "created_at": timestamp string,
    "display_name": string
}
```

Message
```json
{
    "id": unsigned integer,
    "created_at": timestamp string,
    "body": string,
    "user_id": uuid string,
    "users": User structure
}
```

Error
```json
{
    "code": string,
    "details": null,
    "hint": null,
    "message": string
}
```

#### Get all channels a user is in

Request

`GET /users/<userId>/channels`

| param  | type |
|--------|------|
| userId | uuid |

Response

| status          | JSON              |
|-----------------|-------------------|
| 200 OK          | array of Channels |
| 400 Bad Request | Error             |

#### Get all users in a channel

Request

`GET /channel/<channelId>/users`

| param     | type             |
|-----------|------------------|
| channelId | unsigned integer |

Response

| status          | JSON           |
|-----------------|----------------|
| 200 OK          | array of Users |
| 400 Bad Request | Error          |

#### Get all messages in a channel

Request

`GET /channel/<channelId>/messages`

| param     | type             |
|-----------|------------------|
| channelId | unsigned integer |

Response

| status          | JSON              |
|-----------------|-------------------|
| 200 OK          | array of Messages |
| 400 Bad Request | Error             |

#### Create new channel

Request

`POST /channel`

| body param  | type    |
|-------------|---------|
| name        | string  |
| description | string  |
| private     | boolean |

Response

| status           | JSON              |
|------------------|-------------------|
| 201 Created      | Null              |
| 400 Bad Request  | Error             |

#### Add user to channel

Request

`POST /channel/<channelId>/users`

| body param  | type         |
|-------------|--------------|
| userId      | uuid         |

Response

| status           | JSON              |
|------------------|-------------------|
| 201 Created      | Null              |
| 400 Bad Request  | Error             |
| 409 Conflict     | Error             |

#### Remove user from channel

Request

`POST /channel/<channelId>/users`

| body param  | type         |
|-------------|--------------|
| userId      | uuid         |
| remove      | bool         |

Response

| status           | JSON              |
|------------------|-------------------|
| 204 No Content   | Null              |
| 400 Bad Request  | Error             |
| 409 Conflict     | Error             |

#### Update unread notifications

Request

`PUT /notifications`

| body param  | type                                                      |
|-------------|-----------------------------------------------------------|
| func        | string ("incrementnotifications" or "clearnotifications") |
| userId      | uuid                                                      |
| channelId   | unsigned integer                                          |

Response

| status          | JSON              |
|-----------------|-------------------|
| 204 No Content  | Null              |
| 404 Not Found   | Error             |

#### Update user display name

Request

`PUT /users/<userId>`

| body param  | type   |
|-------------|--------|
| displayName | string |

Response

| status          | JSON  |
|-----------------|-------|
| 200 OK          | User  |
| 400 Bad Request | Error |

## Developer Reference

### Running
1. Clone the repo
2. Create a .env file with `SUPABASE_URL` and `SUPABASE_KEY` defined using the values from the Supabase API Settings page
3. Create `backend.crt` and `backend.key` files for the https server
3. Run `npm install`
4. Run `npm start`

### Deployment
1. Use a Google Cloud SDK Shell to run `gcloud builds submit --tag=gcr.io/<project-name>/<image-name>`
2. Create a Google Compute Engine VM using the above tagged image

### Testing Locally
1. Create a .env.test file with test database `SUPABASE_URL` and `SUPABASE_KEY` values and define `TEST_USER1` and `TEST_USER2` using two `id` values from the `users` table
2. In your terminal run the tests with `npm run test`

### Testing Deployment
1. Update the .env file with `TEST_USER1` and `TEST_USER2` values using two `id` values from the `users` table and define `DEPLOYED_URL` as the address of the deployed backend
2. In a terminal run `npm run test-deployed`