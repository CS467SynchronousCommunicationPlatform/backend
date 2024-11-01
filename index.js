/*
Basic server structure integrating socket.io and express taken from Socket.io tutorial
https://socket.io/docs/v4/tutorial/step-3
*/
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
dotenv.config();

// server constants
const app = express();
const server = createServer(app);
const io = new Server(server, { transports: ["websocket"] });

// chat constants and globals
let clients = new Map();

// helper function to report error on socket and in console log
function error(socket, message) {
  socket.emit("error", message);
  console.error(message);
}

// helper function to validate general chat message
function isValidGeneralMessage(socket, message) {
  // check that the message has all required fields and they are strings
  for (const field of ["body", "user_id", "timestamp"]) {
    if (message[field] === undefined) {
      error(socket, `General message missing "${field}" property`);
      return false;
    }
    if (typeof message[field] !== "string") {
      error(socket, `General message "${field}" property is not a string`)
      return false;
    }
  }

  // check if created_at is a valid timestamp
  if (new Date(message.timestamp).toString() === "Invalid Date") {
    error(socket, `General message "timestamp" is "${message.created_at}" which is not a valid timestamp`)
    return false;
  }

  return true;
}

// Registers a client socket connection with the backend
function registerConnection(socket) {
  // verify the connection has a token
  const token = socket.handshake.auth?.token;
  if (token === undefined) {
    error(socket, "Auth token not provided")
    socket.disconnect();
    return false;
  }

  // add socket to map of client connections
  clients.set(token, socket);
  console.debug(`${token} client connected`);

  // register disconnect listener to remove socket from client connections
  socket.on("disconnect", () => {
    clients.delete(token);
    console.debug(`${token} client disconnected`);
  });

  return true;
}

// Registers a client socket connection with the backend
function registerGeneralChatListener(socket) {
  socket.on("general", (message) => {
    // validate message contents
    if (!isValidGeneralMessage(socket, message))
      return;

    // send general chat message to every other user
    for (const [user, other] of clients.entries()) {
      if (user !== socket.handshake.auth.token)
        other.emit("general", message);
    }
  });
}

io.on("connection", (socket) => {
  // handle registering the client connection, return on failure
  if (!registerConnection(socket))
    return;

  // register listeners for general chat
  registerGeneralChatListener(socket);
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
})

// start server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});