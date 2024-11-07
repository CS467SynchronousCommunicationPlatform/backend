import dotenv from "dotenv";
import { io } from "socket.io-client";
import { assert } from "chai";
dotenv.config();

const SERVER = `http://localhost:${process.env.PORT}`

describe("Connection Tests", () => {
  it("No Auth Connection", (done) => {
    const socket = io(SERVER, { transports: ["websocket"] })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token not provided");
      socket.disconnect();
      done();
    });
  });

  it("Bad Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: "BAD_TOKEN" }, transports: ["websocket"] })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token does not match a user");
      socket.disconnect();
      done();
    });
  });

  it("Good Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"] })
    socket.on("connected", (msg) => {
      assert.equal(msg.status, "connected");
      socket.disconnect();
      done();
    });
  });
});