/*
RabbitMQ (AMQP) code based on promise api docs (https://amqp-node.github.io/amqplib/channel_api.html) and 
RabbitMQ Javascript Hello World example (https://www.rabbitmq.com/tutorials/tutorial-one-javascript)
Websocket code based on ws api docs (https://github.com/websockets/ws/blob/master/doc/ws.md)
*/

const websocket = require("ws")
const amqp = require('amqplib');
require('dotenv').config()

const wss = new websocket.Server({ port: 8000 })
const GENERAL = "general";

let clients = new Map()
let channel;

// connect to hosted rabbitmq
amqp.connect(process.env.RABBITMQ_URL)
  .then(connection => connection.createChannel())
  .then(chan => {
    // create general chat channel
    chan.assertQueue(GENERAL, { durable: true });
    channel = chan;

    // register consumer for general chat, sends message to all sockets
    chan.consume(GENERAL, message => {
      for (const sock of wss.clients) {
        sock.send(message.content.toString())
      }
    })
  }).catch(err => {
    throw err;
  });

// handle websocket connections
wss.on("connection", ws => {
  ws.on("message", message => {
    // verify structure of message from client
    try {
      let json = JSON.parse(message)
    } catch {
      ws.send(JSON.stringify({ "error": `invalid json` }));
      return;
    }
    for (const key of ["id", "type", "message"]) {
      if (json[key] === undefined) {
        ws.send(JSON.stringify({ "error": `${key} was not provided in json` }));
        return;
      }
    }

    // map from client id to websocket connection
    clients[json.id] = ws;

    // forward message to rabbitmq
    channel.sendToQueue(json.type, Buffer.from(json.message));
  })
});