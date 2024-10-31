/*
Basic server structure integrating socket.io and express taken from Socket.io tutorial
https://socket.io/docs/v4/tutorial/step-3
*/
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js"
dotenv.config();

// server constants
const app = express();
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
app.get("/channels/:userId", async (req, res) => {
  let userId = req.params.userId;
  const { data, error } = await supabase
    .from('channels')
    .select('name, description, channels_users!inner()')
    .eq('channels_users.user_id', userId)

  res.send(data)
})

// endpoint for users in channel
app.get("/users/:channelId", async (req, res) => {
  let channelId = req.params.channelId;
  const { data, error } = await supabase
    .from('users')
    .select('display_name, channels_users!inner()')
    .eq('channels_users.channel_id', channelId)

  res.send(data)
})

// endpoint for messages in channel
app.get("/messages/:channelId", async (req, res) => {
  let channelId = req.params.channelId;
  const { data, error } = await supabase
    .from('messages')
    .select('body, channels_messages!inner()')
    .eq('channels_messages.channels_id', channelId)

  res.send(data)
})

// start server
server.listen(process.env.PORT, () => {
  console.log(`Server running at http://localhost:${process.env.PORT}`);
});