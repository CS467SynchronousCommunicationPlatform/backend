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

io.on("connection", (socket) => {
  // add socket to map of client connections
  clients.set(socket.id, socket);
  console.log(`${socket.id} client connected`);

  // register disconnect to remove socket from client connections
  socket.on("disconnect", () => {
    clients.delete(socket.id);
    console.log(`${socket.id} client disconnected`);
  });
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
})

// start server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});