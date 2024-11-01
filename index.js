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

io.on("connection", (socket) => {
  // handle registering the client connection, return on failure
  if (!registerConnection(socket))
    return;
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
})

// start server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});