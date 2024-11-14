import dotenv from "dotenv";
import { io } from "socket.io-client";
import { assert } from "chai";
dotenv.config();

const LOCAL = process.env.DEPLOYED === undefined
const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;

describe("Connection Tests", () => {
  it("No Auth Connection", (done) => {
    const socket = io(SERVER, { transports: ["websocket"], rejectUnauthorized: !LOCAL })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token not provided");
      socket.disconnect();
      done();
    });
  });

  it("Bad Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: "BAD_TOKEN" }, transports: ["websocket"], rejectUnauthorized: !LOCAL })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token does not match a user");
      socket.disconnect();
      done();
    });
  });

  it("Good Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: !LOCAL })
    socket.on("connected", (msg) => {
      assert.equal(msg.status, "connected");
      socket.disconnect();
      done();
    });
  });
});