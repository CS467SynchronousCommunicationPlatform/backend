/*
Basic server structure integrating socket.io and express taken from Socket.io tutorial
https://socket.io/docs/v4/tutorial/step-3
*/
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

// server constants
const PORT = 8000;
const app = express();
const server = createServer(app);
const io = new Server(server, { transports: ["websocket"] });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// global maps from user id to client info
let clients = new Map(); // user id -> socket
let displayNames = new Map(); // user id -> display name

// helper function to report error on socket and in console log
function error(socket, message) {
  socket.emit("error", message);
  console.error(message);
}

// helper function to validate general chat message
function isValidGeneralMessage(socket, message) {
  // check that the message has all required fields and they are strings
  for (const field of ["body", "timestamp"]) {
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
    error(socket, `General message "timestamp" is "${message.timestamp}" which is not a valid timestamp`)
    return false;
  }

  return true;
}

// Registers a client socket connection with the backend
async function registerConnection(socket) {
  // verify the connection has a token
  const userId = socket.handshake.auth?.token;
  if (userId === undefined) {
    error(socket, "Auth token not provided")
    socket.disconnect();
    return false;
  }

  // verify the token provided is a valid user id
  if (!displayNames.has(userId)) {
    const { data, err } = await supabase.from("users").select("display_name").eq("id", userId);
    if (data === null || data.length === 0) {
      error(socket, "Auth token does not match a user")
      socket.disconnect();
      return false;
    }
    displayNames.set(userId, data[0].display_name);
  }

  // add socket to map of client connections
  clients.set(userId, socket);
  console.debug(`${userId} client connected`);

  // register disconnect listener to remove socket from client connections
  socket.on("disconnect", () => {
    clients.delete(userId);
    console.debug(`${userId} client disconnected`);
  });

  return true;
}

// Registers general chat listener for a client socket
function registerGeneralChatListener(socket) {
  socket.on("general", (message) => {
    // validate message contents
    if (!isValidGeneralMessage(socket, message))
      return;

    // replace user id with user display name
    message.user = displayNames.get(socket.handshake.auth.token);

    // send general chat message to every other user
    for (const [user, other] of clients.entries()) {
      if (user !== socket.handshake.auth.token)
        other.emit("general", message);
    }
  });
}

// register connection and listeners
io.on("connection", async (socket) => {
  if (!(await registerConnection(socket)))
    return;
  registerGeneralChatListener(socket);
  socket.emit("connected", { status: "connected" });
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
})

// start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});