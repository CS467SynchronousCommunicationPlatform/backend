/*
Basic server structure integrating socket.io and express taken from Socket.io tutorial
https://socket.io/docs/v4/tutorial/step-3
*/
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { Server } from "socket.io";
import { errorHandler } from "./middleware/error-handler.js";
import { logHandler, requestString } from "./middleware/log-handler.js";
import * as model from "./model.js";
import { logger } from "./logger.js";
dotenv.config();

// server constants
const PORT = 443;

const app = express();
app.use(cors());
app.use(express.json())
app.use(errorHandler);
app.use(logHandler);

const options = {
  key: readFileSync("./backend.key"),
  cert: readFileSync("./backend.crt")
};
const server = createServer(options, app);

const io = new Server(server, { transports: ["websocket"] });

// global maps from user id to client info
let clients = new Map(); // user id -> socket
let displayNames = new Map(); // user id -> display name
let channelUsers = new Map(); // channel id -> array of user ids

// helper function to report error on socket and in console log
function socketError(socket, message) {
  socket.emit("error", message);
  logger.socket(message);
}

// helper function to validate general chat message
function isValidChatMessage(socket, message) {
  // check that the message has all required fields and they are strings
  for (const field of ["body", "timestamp", "channel_id"]) {
    if (message[field] === undefined) {
      socketError(socket, `Chat message missing "${field}" property`);
      return false;
    }
    if (field === "channel_id") {
      if (typeof message[field] !== "number") {
        socketError(socket, `Chat message "channel_id" property is not a number`)
        return false;
      }
    }
    else if (typeof message[field] !== "string") {
      socketError(socket, `Chat message "${field}" property is not a string`)
      return false;
    }
  }

  // check if created_at is a valid timestamp
  if (new Date(message.timestamp).toString() === "Invalid Date") {
    socketError(socket, `Chat message "timestamp" is "${message.timestamp}" which is not a valid timestamp`)
    return false;
  }

  // check that channel_id is a valid channel
  if (!channelUsers.has(message.channel_id)) {
    socketError(socket, `Chat message "channel_id" is "${message.channel_id}" which is not a valid channel`)
    return false;
  }

  // check that this user is in the channel
  if (!channelUsers.get(message.channel_id).includes(socket.handshake.auth.token)) {
    socketError(socket, `Chat message user is not a member of the chat with "channel_id" value "${message.channel_id}"`)
    return false;
  }

  return true;
}

// Registers a client socket connection with the backend
async function registerConnection(socket) {
  // verify the connection has a token
  const userId = socket.handshake.auth?.token;
  if (userId === undefined) {
    socketError(socket, "Auth token not provided")
    socket.disconnect();
    return false;
  }

  // verify the token provided is a valid user id
  if (!displayNames.has(userId)) {
    const { data } = await model.readUser(userId);
    if (data === null || data.length === 0) {
      socketError(socket, "Auth token does not match a user")
      socket.disconnect();
      return false;
    }
    displayNames.set(userId, data[0].display_name);
  }

  // add socket to map of client connections
  clients.set(userId, socket);
  logger.socket(`${userId} client connected`);

  // register disconnect listener to remove socket from client connections
  socket.on("disconnect", () => {
    clients.delete(userId);
    logger.socket(`${userId} client disconnected`);
  });

  return true;
}

// Registers chat listener for a client socket
function registerChatListener(socket) {
  socket.on("chat", async (message) => {
    // validate message contents
    if (!isValidChatMessage(socket, message)) {
      return;
    }

    // add user display name using user id
    const userId = socket.handshake.auth.token;
    message.user = displayNames.get(userId);

    // send chat message to every online user in that channel
    for (const userId of channelUsers.get(message.channel_id)) {
      const socket = clients.get(userId);
      if (socket !== undefined) {
        socket.emit("chat", message);
        logger.socket(`Sending ${JSON.stringify(message)} to ${userId} socket`);
      }
    }

    // persist message in database
    model.insertMessage(message.body, userId, message.timestamp, message.channel_id)
      .then(response => {
        if (response.error)
          socketError(socket, "Message persistence failed")
      });
  });
}

// register connection and listeners
io.on("connection", async (socket) => {
  if (!(await registerConnection(socket))) {
    return;
  }

  registerChatListener(socket);
  socket.emit("connected", { status: "connected" });
  logger.socket(`Socket initialization completed for ${socket.handshake.auth.token}`)
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
});

// helper function for response sending
function sendResponse(res, data, error, status) {
  if (error) {
    logger.http(`REST status ${status} error ${JSON.stringify(error)}`);
    res.status(status).send(error)
  } else {
    logger.http(`REST status ${status} response ${JSON.stringify(data)}`);
    res.status(status).send(data)
  }
}

// endpoint for channels user is in
app.get("/users/:userId/channels", async (req, res, next) => {
  try {
    const { data, error, status } = await model.readAllChannelsForUser(req.params.userId);
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// endpoint for updating display_name
app.put("/users/:userId", async (req, res, next) => {
  try {
    const { data, error, status } = await model.updateUserDisplayName(req.params.userId, req.body.displayName);
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
})

// endpoint for users in channel
app.get("/channels/:channelId/users", async (req, res, next) => {
  try {
    const { data, error, status } = await model.readAllUsersInChannel(req.params.channelId);
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// endpoint for creating channels
app.post("/channels", async (req, res, next) => {
  try {
    const { data, error, status } = await model.addChannels(req.body.name, req.body.description);
    // add channel for websocket traffic on success
    if (data !== null) {
      channelUsers.set(data[0].id, []);
    }
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// endpoint for adding users to channels
app.post("/channels/:channelId/users", async (req, res, next) => {
  try {
    const { data, error, status } = await model.addChannelsUsers(req.params.channelId, req.body.userId);
    // add user to channel for websocket traffic on success
    if (status === 201) {
      channelUsers.get(Number(req.params.channelId)).push(req.body.userId);
    }
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
})

// endpoint for messages in channel
app.get("/channels/:channelId/messages", async (req, res, next) => {
  try {
    const { data, error, status } = await model.readAllMessagesInChannel(req.params.channelId);
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// endpoint for updating unread notifications
app.put("/notifications", async (req, res, next) => {
  try {
    const { data, error, status } = await model.updateUnreadMessage(req.body.function, req.body.userId, req.body.channelId);
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// catch any non-specified endpoints and report error
app.all("*", (req, res) => {
  const errorMsg = `Invalid method or endpoint: ${requestString(req)}`
  logger.http(errorMsg);
  res.status(400).send({ "Error": errorMsg })
});

// initializes backend with necessary data from database
async function initializeBackend() {
  // get all display names for registered users
  let users = await model.readAllUsers();

  if (users.error) {
    throw users.error;
  }

  for (const user of users.data) {
    displayNames.set(user.id, user.display_name);
  }

  // get all users for registered channels
  const { data, error } = await model.readAllChannelsUsers();

  if (error) {
    throw error;
  }

  for (const row of data) {
    if (channelUsers.has(row.channel_id)) {
      channelUsers.get(row.channel_id).push(row.user_id);
    } else {
      channelUsers.set(row.channel_id, [row.user_id]);
    }
  }
}

// initialize and then start server
initializeBackend().then(() => {
  server.listen(PORT, () => {
    logger.info(`Server running at https://localhost:${PORT}`);
  });
}).catch(err => {
  logger.error(`Backend startup failed: ${err}`);
})
