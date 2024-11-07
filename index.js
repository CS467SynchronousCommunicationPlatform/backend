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
let channelUsers = new Map(); // channel id -> array of user ids

// helper function to report error on socket and in console log
function socket_error(socket, message) {
  socket.emit("error", message);
  console.error(message);
}

// helper function to validate general chat message
function isValidChatMessage(socket, message) {
  // check that the message has all required fields and they are strings
  for (const field of ["body", "timestamp", "channel_id"]) {
    if (message[field] === undefined) {
      socket_error(socket, `Chat message missing "${field}" property`);
      return false;
    }
    if (field === "channel_id") {
      if (typeof message[field] !== "number") {
        socket_error(socket, `Chat message "channel_id" property is not a number`)
        return false;
      }
    }
    else if (typeof message[field] !== "string") {
      socket_error(socket, `Chat message "${field}" property is not a string`)
      return false;
    }
  }

  // check if created_at is a valid timestamp
  if (new Date(message.timestamp).toString() === "Invalid Date") {
    socket_error(socket, `Chat message "timestamp" is "${message.timestamp}" which is not a valid timestamp`)
    return false;
  }

  // check that channel_id is a valid channel
  if (!channelUsers.has(message.channel_id)) {
    socket_error(socket, `Chat message "channel_id" is "${message.channel_id}" which is not a valid channel`)
    return false;
  }

  // check that this user is in the channel
  if (!channelUsers.get(message.channel_id).includes(socket.handshake.auth.token)) {
    socket_error(socket, `Chat message user is not a member of the chat with "channel_id" value "${message.channel_id}"`)
    return false;
  }

  return true;
}

// Registers a client socket connection with the backend
async function registerConnection(socket) {
  // verify the connection has a token
  const userId = socket.handshake.auth?.token;
  if (userId === undefined) {
    socket_error(socket, "Auth token not provided")
    socket.disconnect();
    return false;
  }

  // verify the token provided is a valid user id
  if (!displayNames.has(userId)) {
    const { data, err } = await supabase.from("users").select("display_name").eq("id", userId);
    if (data === null || data.length === 0) {
      socket_error(socket, "Auth token does not match a user")
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

// Registers chat listener for a client socket
function registerChatListener(socket) {
  socket.on("chat", async (message) => {
    // validate message contents
    if (!isValidChatMessage(socket, message)) {
      return;
    }

    // add user display name using user id
    message.user = displayNames.get(socket.handshake.auth.token);

    // send chat message to every user in that channel
    for (const userId of channelUsers.get(message.channel_id)) {
      clients.get(userId).emit("chat", message);
    }

    // persist message in database
    const { data } = await supabase.from("messages")
      .insert({ body: message.body, user_id: socket.handshake.auth.token, created_at: message.timestamp })
      .select("id");

    await supabase.from('channels_messages')
      .insert({ channels_id: message.channel_id, messages_id: data[0]["id"] })
  });
}

// register connection and listeners
io.on("connection", async (socket) => {
  if (!(await registerConnection(socket))) {
    return;
  }

  registerChatListener(socket);
  socket.emit("connected", { status: "connected" });
});

// basic REST endpoint
app.get("/", (req, res) => {
  res.send("Backend REST API running")
})


// initializes backend with necessary data from database
async function initializeBackend() {
  // get all display names for registered users
  let users = await supabase
    .from('users')
    .select('id, display_name');

  if (users.error) {
    throw users.error;
  }

  for (const user of users.data) {
    displayNames.set(user.id, user.display_name);
  }

  // get all users for registered channels
  const { data, error } = await supabase.from("channels_users").select("channel_id, user_id");
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
    console.log(`Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error(`Backend startup failed: ${err}`);
})
