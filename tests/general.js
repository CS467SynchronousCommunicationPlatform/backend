import dotenv from "dotenv";
import { io } from "socket.io-client";
import { createClient } from "@supabase/supabase-js";
import { assert } from "chai";
dotenv.config();

const SERVER = "http://localhost:8000"
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const TIMESTAMP = "2024-11-01T06:25:51.182Z"

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
      assert.equal(err, "Chat message missing \"body\" property");
      done();
    });

    socket1.emit("general", { timestamp: TIMESTAMP });
  });

  it("Missing timestamp message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "Chat message missing \"timestamp\" property");
      done();
    });

    socket1.emit("general", { body: "Hello" });
  });

  it("body message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "Chat message \"body\" property is not a string");
      done();
    });

    socket1.emit("general", { body: 1, timestamp: TIMESTAMP });
  });

  it("timestamp message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "Chat message \"timestamp\" property is not a string");
      done();
    });

    socket1.emit("general", { body: "Hello", timestamp: 1 });
  });

  it("timestamp message field is invalid", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, "Chat message \"timestamp\" is \"BAD_TIME\" which is not a valid timestamp");
      done();
    });

    socket1.emit("general", { body: "Hello", timestamp: "BAD_TIME" });
  });

  it("Message successfully sent", (done) => {
    const message = { body: "Hello", timestamp: TIMESTAMP }
    socket2.on("general", async (msg) => {
      // assert message components
      assert.equal(msg.body, message.body);
      assert.equal(msg.timestamp, message.timestamp);
      assert.isDefined(msg.user);

      // assert message in database, then remove it
      const { data } = await supabase.from("messages").select("*").eq("created_at", TIMESTAMP);
      assert.notEqual(data, null);
      assert.notEqual(data.length, 0);
      assert.equal(data[0].body, message.body);
      assert.equal(data[0].user_id, process.env.TEST_USER1);
      await supabase.from("messages").delete().eq("id", data[0].id);
      done();
    })

    socket1.emit("general", message);
  })
});