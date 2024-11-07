/*
Basic server structure integrating socket.io and express taken from Socket.io tutorial
https://socket.io/docs/v4/tutorial/step-3
*/
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js"
import { errorHandler } from "./middleware/error-handler.js";
dotenv.config();

// server constants
const app = express();
app.use(express.json())
app.use(errorHandler)
const server = createServer(app);
const io = new Server(server, { transports: ["websocket"] });

// supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

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

// endpoint for channels user is in
app.get("/users/:userId/channels", async (req, res, next) => {
  try {
    let userId = req.params.userId;
    const { data, error, status } = await supabase
      .from('channels')
      .select('name, description, channels_users!inner()')
      .eq('channels_users.user_id', userId)

    if (error) {
      res.send(error)
    } else {
      res.send(data)
    }
  } catch (err) {
    next(err)
  }
})

// endpoint for users in channel
app.get("/channels/:channelId/users", async (req, res) => {
  try {
    let channelId = req.params.channelId;
    const { data, error, status } = await supabase
      .from('users')
      .select('display_name, channels_users!inner()')
      .eq('channels_users.channel_id', channelId)

    if (error) {
      res.status(status).send(error)
    } else {
      res.status(status).send(data)
    }
  } catch (err) {
    next(err)
  }
})

// endpoint for messages in channel
app.get("/channels/:channelId/messages", async (req, res) => {
  try {
    let channelId = req.params.channelId;
    const { data, error, status } = await supabase
      .from('messages')
      .select('body, created_at, channels_messages!inner(), users!inner(display_name)')
      .eq('channels_messages.channels_id', channelId)

    if (error) {
      res.status(status).send(error)
    } else {
      res.status(status).send(data)
    }
  } catch (err) {
    next(err)
  }
})

// endpoint for adding message to channel
app.post("/messages/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({ body: req.body.message, user_id: req.body.user_id})
      .select('id')

    const { channels_messages_error } = await supabase
    .from('channels_messages')
    .insert({channels_id: req.body.channel_id, messages_id: data[0]['id']})
  } catch (err) {
    next(err)
  }
})

// start server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});