import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { io } from "socket.io-client";
import { assert } from "chai";

const LOCAL = process.env.DEPLOYED === undefined;
dotenv.config({ path: LOCAL ? ".env.test" : ".env" });

const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;

describe("Connection Tests", () => {
  let backend;

  before(async () => {
    if (LOCAL) {
      backend = spawn("node", ["index.js"], { env: { ...process.env } });
      await new Promise((resolve, reject) => {
        backend.stdout.on("data", (data) => {
          if (data.toString().includes("Server running at")) {
            resolve();
          }
        });
      });
    }
  });

  after((done) => {
    if (LOCAL)
      backend.kill();
    done();
  });

  it("No Auth Connection", (done) => {
    const socket = io(SERVER, { transports: ["websocket"], rejectUnauthorized: false })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token not provided");
      socket.disconnect();
      done();
    });
  });

  it("Bad Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: "BAD_TOKEN" }, transports: ["websocket"], rejectUnauthorized: false })
    socket.on("error", (err) => {
      assert.equal(err, "Auth token does not match a user");
      socket.disconnect();
      done();
    });
  });

  it("Good Auth Connection", (done) => {
    const socket = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: false })
    socket.on("connected", (msg) => {
      assert.equal(msg.status, "connected");
      socket.disconnect();
      done();
    });
  });
});