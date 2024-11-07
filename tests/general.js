import dotenv from "dotenv";
import { io } from "socket.io-client";
import { assert } from "chai";
dotenv.config();

const SERVER = `http://localhost:${process.env.PORT}`

describe("General Chat", () => {
  let socket1, socket2;

  beforeEach((done) => {
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"] });
    socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"] });
    setTimeout(done, 1000);
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  it("Missing body message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "General message missing \"body\" property");
      done();
    });

    socket1.emit("general", { timestamp: new Date().toISOString() });
  });

  it("Missing timestamp message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "General message missing \"timestamp\" property");
      done();
    });

    socket1.emit("general", { body: "Hello" });
  });

  it("body message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "General message \"body\" property is not a string");
      done();
    });

    socket1.emit("general", { body: 1, timestamp: new Date().toISOString() });
  });

  it("timestamp message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "General message \"timestamp\" property is not a string");
      done();
    });

    socket1.emit("general", { body: "Hello", timestamp: 1 });
  });

  it("timestamp message field is invalid", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "General message \"timestamp\" is \"BAD_TIME\" which is not a valid timestamp");
      done();
    });

    socket1.emit("general", { body: "Hello", timestamp: "BAD_TIME" });
  });

  it("Message successfully sent", (done) => {
    const message = { body: "Hello", timestamp: "2024-11-01T06:25:51.182Z" }
    socket2.on("general", (msg) => {
      assert.equal(msg.body, message.body);
      assert.equal(msg.timestamp, message.timestamp);
      assert.isDefined(msg.user);
      done();
    })

    socket1.emit("general", message);
  })
});