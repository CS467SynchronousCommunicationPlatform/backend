import dotenv from "dotenv";
import { io } from "socket.io-client";
dotenv.config();

// connect a few clients to the server
const SERVER = `http://localhost:${process.env.PORT}`
const socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"] })
const socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"] })

// simple way to wait for both sockets to connect for purposes of demo
setTimeout(() => {
    // listen for general chat messages
    socket1.on("general", (msg) => console.log("user1 received:", msg));
    socket2.on("general", (msg) => console.log("user2 received:", msg));

    // send a general chat message
    socket1.emit("general", { body: "Hello", user_id: process.env.TEST_USER1, timestamp: new Date().toISOString() });
    socket2.emit("general", { body: "World", user_id: process.env.TEST_USER2, timestamp: new Date().toISOString() });
}, 1000)