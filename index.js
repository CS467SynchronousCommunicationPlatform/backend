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

amqp.connect(process.env.RABBITMQ_URL)
  .then(connection => connection.createChannel())
  .then(chan => {
    chan.assertQueue(GENERAL, { durable: true });
    channel = chan;
    chan.consume(GENERAL, message => {
      for (const sock of wss.clients) {
        sock.send(message.content.toString())
      }
    })
  }).catch(err => {
    throw err;
  });

wss.on("connection", ws => {
  ws.on("message", message => {
    let json = JSON.parse(message)
    for (const key of ["id", "type", "message"]) {
      if (json[key] === undefined) {
        ws.send(JSON.stringify({ "error": `${key} was not provided in message` }));
        return;
      }
    }
    clients[json.id] = ws;
    channel.sendToQueue(json.type, Buffer.from(json.message));
  })
});