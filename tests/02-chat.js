import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { io } from "socket.io-client";
import { createClient } from "@supabase/supabase-js";
import { assert } from "chai";

const LOCAL = process.env.DEPLOYED === undefined;
dotenv.config({ path: LOCAL ? ".env.test" : ".env" });

const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;
const TIMESTAMP = "2024-11-01T06:25:51.182Z"


describe("Chat Tests", () => {
  let backend, socket1, socket2, supabase, GENERAL, TEST_PRIVATE_CHANNEL;

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

    // connect to db and get channel values from database
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    GENERAL = await supabase.from("channels")
      .select("id").eq("name", "General Chat")
      .then(result => result.data[0].id);
    TEST_PRIVATE_CHANNEL = await supabase.from("channels") //TODO replace with insert when insert is enabled
      .select("id").eq("name", "test_channel_2")
      .then(result => result.data[0].id);

    // connect sockets
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: !LOCAL });
    socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"], rejectUnauthorized: !LOCAL });
  });

  after((done) => {
    socket1.disconnect();
    socket2.disconnect();
    if (LOCAL)
      backend.kill();
    done();
  });

  afterEach(() => {
    // unregister listeners between tests
    socket1.off("error");
    socket1.off("chat");
    socket2.off("error");
    socket2.off("chat");
  })

  it("Missing body message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message missing "body" property`);
      done();
    });

    socket1.emit("chat", { timestamp: TIMESTAMP, channel_id: GENERAL });
  });

  it("Missing timestamp message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message missing "timestamp" property`);
      done();
    });

    socket1.emit("chat", { body: "Hello", channel_id: GENERAL });
  });

  it("Missing channel_id message field", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message missing "channel_id" property`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: TIMESTAMP });
  });

  it("body message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message "body" property is not a string`);
      done();
    });

    socket1.emit("chat", { body: 1, timestamp: TIMESTAMP, channel_id: GENERAL });
  });

  it("timestamp message field is not a string", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message "timestamp" property is not a string`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: 1, channel_id: GENERAL });
  });

  it("channel_id message field is not a number", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message "channel_id" property is not a number`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: TIMESTAMP, channel_id: "channel" });
  });

  it("timestamp message field is invalid", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message "timestamp" is "BAD_TIME" which is not a valid timestamp`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: "BAD_TIME", channel_id: GENERAL });
  });

  it("channel_id message field is invalid", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message "channel_id" is "0" which is not a valid channel`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: TIMESTAMP, channel_id: 0 });
  });

  it("user is not in chat for channel_id", (done) => {
    socket1.on("error", (err) => {
      assert.equal(err, `Chat message user is not a member of the chat with "channel_id" value "${TEST_PRIVATE_CHANNEL}"`);
      done();
    });

    socket1.emit("chat", { body: "Hello", timestamp: TIMESTAMP, channel_id: TEST_PRIVATE_CHANNEL });
  });


  it("General message successfully sent", (done) => {
    const message = { body: "Hello", timestamp: TIMESTAMP, channel_id: GENERAL }

    socket2.on("chat", async (msg) => {
      // assert message components
      assert.equal(msg.body, message.body);
      assert.equal(msg.timestamp, message.timestamp);
      assert.equal(msg.channel_id, message.channel_id);
      assert.isDefined(msg.user);

      // wait a moment for db persistence, assert message in database, then remove it
      setTimeout(async () => {
        // assert message entry in database
        const message_data = await supabase.from("messages")
          .select("*").eq("created_at", TIMESTAMP)
          .then(res => res.data);
        assert.notEqual(message_data, null);
        assert.notEqual(message_data.length, 0);
        assert.equal(message_data[0].body, message.body);
        assert.equal(message_data[0].user_id, process.env.TEST_USER1);

        // assert channels_messages entry in database
        const channel_data = await supabase.from("channels_messages")
          .select("*").eq("message_id", message_data[0].id)
          .then(res => res.data);
        assert.notEqual(channel_data, null);
        assert.notEqual(channel_data.length, 0);
        assert.equal(channel_data[0].message_id, message_data[0].id);
        assert.equal(channel_data[0].channel_id, GENERAL);

        // remove test message
        await supabase.from("messages").delete().eq("id", message_data[0].id);
        done();
      }, 500)
    });

    socket1.emit("chat", message);
  });

  it("Direct message successfully sent", (done) => {
    const message = { body: "Hello", timestamp: TIMESTAMP, channel_id: TEST_PRIVATE_CHANNEL }
    socket2.on("chat", async (msg) => {
      // assert message components
      assert.equal(msg.body, message.body);
      assert.equal(msg.timestamp, message.timestamp);
      assert.equal(msg.channel_id, message.channel_id);
      assert.isDefined(msg.user);

      // wait a moment for db persistence
      setTimeout(async () => {
        // assert message entry in database
        const message_data = await supabase.from("messages")
          .select("*").eq("created_at", TIMESTAMP)
          .then(res => res.data);
        assert.notEqual(message_data, null);
        assert.notEqual(message_data.length, 0);
        assert.equal(message_data[0].body, message.body);
        assert.equal(message_data[0].user_id, process.env.TEST_USER2);

        // assert channels_messages entry in database
        const channel_data = await supabase.from("channels_messages")
          .select("*").eq("message_id", message_data[0].id)
          .then(res => res.data);
        assert.notEqual(channel_data, null);
        assert.notEqual(channel_data.length, 0);
        assert.equal(channel_data[0].message_id, message_data[0].id);
        assert.equal(channel_data[0].channel_id, TEST_PRIVATE_CHANNEL);

        // remove test message
        await supabase.from("messages").delete().eq("id", message_data[0].id);
        done();
      }, 500)
    })

    socket2.emit("chat", message);
  })
});