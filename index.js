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
let userStatus = new Map(); // user id -> status

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

// helper to update map of user statuses and emit statu to all users
function statusUpdate(userId, status) {
  userStatus.set(userId, status);
  for (const socket of clients.values()) {
    socket.emit("status", {
      "user": displayNames.get(userId),
      "status": status
    });
  }
}

// Register a new user that has connected
async function registerNewUser(socket, userId) {
  let data, error;

  // check user id, add user if valid
  ({ data } = await model.readUser(userId));
  if (data === null || data.length === 0) {
    socketError(socket, "Auth token does not match a user")
    socket.disconnect();
    return false;
  }
  displayNames.set(userId, data[0].display_name);

  // fetch channels for user
  ({ data, error } = await model.readAllChannelsForUser(userId));
  if (error) {
    socketError(socket, "User initialization failed, could not get channels")
    socket.disconnect();
    return false;
  }

  // add user to channels
  for (const { id } of data) {
    if (channelUsers.has(id)) {
      channelUsers.get(id).push(userId);
    } else {
      channelUsers.set(id, [userId]);
    }
  }

  logger.socket(`Added new user ${userId}`);
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

  // if the user has not been added already, verify the user id and add them
  if (!displayNames.has(userId)) {
    if (!(await registerNewUser(socket, userId))) {
      return false;
    }
  }

  // add socket to map of client connections
  clients.set(userId, socket);
  logger.socket(`${userId} client connected`);

  // register disconnect listener to remove socket from client connections and update status to offline
  socket.on("disconnect", () => {
    clients.delete(userId);
    statusUpdate(userId, "Offline");
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

    // send chat message to every online user in that channel and increment their notifications
    for (const userId of channelUsers.get(message.channel_id)) {
      const socket = clients.get(userId);
      if (socket !== undefined) {
        socket.emit("chat", message);
        logger.socket(`Sending ${JSON.stringify(message)} to ${userId} socket`);
      }
    }

    // persist message in database
    const { error } = await model.insertMessage(message.body, userId, message.timestamp, message.channel_id);
    if (error) {
      socketError(socket, "Message persistence failed");
      return;
    }

    // send chat message to every online user in that channel and increment their notifications
    for (const userId of channelUsers.get(message.channel_id)) {
      const { data } = await model.updateUnreadMessage("incrementnotifications", userId, message.channel_id);
      const socket = clients.get(userId);
      if (data !== undefined && socket !== undefined) {
        socket.emit("notifications", { channel_id: data.channel_id, unread: data.unread })
      }
    }
  });
}

// Registers status listener for a client socket
function registerStatusListener(socket) {
  socket.on("status", async (message) => {
    // ignore invalid statuses
    if (message.status !== "Online" && message.status !== "Away")
      return;

    // send status message to every online user
    statusUpdate(socket.handshake.auth.token, message.status);
  });
}

// register connection and listeners
io.on("connection", async (socket) => {
  if (!(await registerConnection(socket))) {
    return;
  }

  registerChatListener(socket);
  registerStatusListener(socket);

  // update user status to online
  statusUpdate(socket.handshake.auth.token, "Online");

  // send connected status along with status info for all users
  let statuses = [];
  for (const [userId, status] of userStatus.entries()) {
    statuses.push({ user: displayNames.get(userId), status: status });
  }
  socket.emit("connected", { status: "connected", userStatus: statuses });
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

// endpoint for all users
app.get("/users", async (req, res, next) => {
  try {
    const { data, error, status } = await model.readAllUsers();
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

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
    if (data !== null && data.length > 0) {
      // send new username to all users and update displayname map
      for (const socket of clients.values()) {
        socket.emit("displayname", {
          "previous": displayNames.get(req.params.userId),
          "new": req.body.displayName,
          "message": "User display name was updated"
        });
      }
      displayNames.set(req.body.userId, req.body.displayName);
    }
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
    const { data, error, status } = await model.addChannels(req.body.name, req.body.description, req.body.private);
    // add channel for websocket traffic on success
    if (data !== null) {
      channelUsers.set(data[0].id, []);
    }
    sendResponse(res, data, error, status);
  } catch (err) {
    next(err)
  }
});

// endpoint for adding and removing users to channels
app.post("/channels/:channelId/users", async (req, res, next) => {
  try {
    let data, error, status
    if (req.body.remove) {
      ({ data, error, status } = await model.removeChannelsUsers(req.params.channelId, req.body.userId));
      if (status === 204) {
        let index = channelUsers.get(Number(req.params.channelId)).indexOf(req.body.userId);
        channelUsers.get(Number(req.params.channelId)).splice(index, 1);
        const socket = clients.get(req.body.userId);
        if (socket !== undefined) {
          socket.emit("channel", { message: "Removed from channel", channelId: Number(req.params.channelId) });
        }
      }
    } else {
      ({ data, error, status } = await model.addChannelsUsers(req.params.channelId, req.body.userId));
      // add user to channel for websocket traffic on success
      if (status === 201) {
        channelUsers.get(Number(req.params.channelId)).push(req.body.userId);
        const socket = clients.get(req.body.userId);
        if (socket !== undefined) {
          socket.emit("channel", { message: "Added to channel", channelId: Number(req.params.channelId) });
        }
      }
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
  let data, error;

  // get all display names for registered users
  ({ data, error } = await model.readAllUsers());

  if (error) {
    throw error;
  }

  for (const { id, display_name } of data) {
    displayNames.set(id, display_name);
  }

  // get all users for registered channels
  ({ data, error } = await model.readAllChannelsUsers());

  if (error) {
    throw error;
  }

  for (const { channel_id, user_id } of data) {
    if (channelUsers.has(channel_id)) {
      channelUsers.get(channel_id).push(user_id);
    } else {
      channelUsers.set(channel_id, [user_id]);
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
