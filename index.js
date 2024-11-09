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
import { createClient } from "@supabase/supabase-js"
import { errorHandler } from "./middleware/error-handler.js";
dotenv.config();

// server constants
const PORT = 443;
let generalId;

const app = express();
app.use(cors());
app.use(express.json())
app.use(errorHandler)

const options = {
  key: readFileSync("./backend.key"),
  cert: readFileSync("./backend.crt")
};
const server = createServer(options, app);

const io = new Server(server, { transports: ["websocket"] });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// global maps from user id to client info
let clients = new Map(); // user id -> socket
let displayNames = new Map(); // user id -> display name

// helper function to report error on socket and in console log
function socket_error(socket, message) {
  socket.emit("error", message);
  console.error(message);
}

// helper function to validate general chat message
function isValidChatMessage(socket, message) {
  // check that the message has all required fields and they are strings
  for (const field of ["body", "timestamp"]) {
    if (message[field] === undefined) {
      socket_error(socket, `Chat message missing "${field}" property`);
      return false;
    }
    if (typeof message[field] !== "string") {
      socket_error(socket, `Chat message "${field}" property is not a string`)
      return false;
    }
  }

  // check if created_at is a valid timestamp
  if (new Date(message.timestamp).toString() === "Invalid Date") {
    socket_error(socket, `Chat message "timestamp" is "${message.timestamp}" which is not a valid timestamp`)
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

// Registers general chat listener for a client socket
function registerChatListener(socket) {
  socket.on("general", async (message) => {
    // validate message contents
    if (!isValidChatMessage(socket, message)) {
      return;
    }

    // add user display name using user id
    message.user = displayNames.get(socket.handshake.auth.token);

    // send chat message to every user
    for (const connection of clients.values()) {
      connection.emit("general", message);
    }

    // persist message in database
    const { data } = await supabase.from("messages")
      .insert({ body: message.body, user_id: socket.handshake.auth.token, created_at: message.timestamp })
      .select("id");

    await supabase.from('channels_messages')
      .insert({ channels_id: generalId, messages_id: data[0]["id"] })
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

// helper function for response sending
function sendResponse(res, data, error, status) {
  if (error) {
    res.status(status).send(error)
  } else {
    res.status(status).send(data)
  }
}

// endpoint for channels user is in
app.get("/users/:userId/channels", async (req, res, next) => {
  try {
    let userId = req.params.userId;
    const { data, error, status } = await supabase
      .from('channels')
      .select('name, description, channels_users!inner()')
      .eq('channels_users.user_id', userId)

    sendResponse(res, data, error, status)
  } catch (err) {
    next(err)
  }
})

// endpoint for users in channel
app.get("/channels/:channelId/users", async (req, res, next) => {
  try {
    let channelId = req.params.channelId;
    const { data, error, status } = await supabase
      .from('users')
      .select('display_name, channels_users!inner()')
      .eq('channels_users.channel_id', channelId)

    sendResponse(res, data, error, status)
  } catch (err) {
    next(err)
  }
})

// endpoint for messages in channel
app.get("/channels/:channelId/messages", async (req, res, next) => {
  try {
    let channelId = req.params.channelId;
    const { data, error, status } = await supabase
      .from('messages')
      .select('body, created_at, channels_messages!inner(), users!inner(display_name)')
      .eq('channels_messages.channel_id', channelId)

    sendResponse(res, data, error, status)
  } catch (err) {
    next(err)
  }
})

// endpoint for adding message to channel
app.post("/messages", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({ body: req.body.message, user_id: req.body.user_id })
      .select('id')

    const { channels_messages_error } = await supabase
      .from('channels_messages')
      .insert({ channel_id: req.body.channel_id, message_id: data[0]['id'] })
  } catch (err) {
    next(err)
  }
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

  // get general chat id
  const { data, error } = await supabase.from("channels").select("id").eq("name", "General Chat");
  if (error) {
    throw error;
  }
  generalId = data[0].id;
}


// initialize and then start server
initializeBackend().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at https://localhost:${PORT}`);
  });
}).catch(err => {
  console.error(`Backend startup failed: ${err}`);
})
