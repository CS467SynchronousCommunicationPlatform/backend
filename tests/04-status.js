import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { io } from "socket.io-client";
import { createClient } from "@supabase/supabase-js";
import { assert } from "chai";

const LOCAL = process.env.DEPLOYED === undefined;
dotenv.config({ path: LOCAL ? ".env.test" : ".env" });

const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;


describe("Status Tests", () => {
  let backend, socket1, socket2, supabase, DISPLAYNAME1, DISPLAYNAME2;

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
    DISPLAYNAME1 = await supabase.from("users")
      .select("display_name").eq("id", process.env.TEST_USER1)
      .then(result => result.data[0].display_name);
    DISPLAYNAME2 = await supabase.from("users")
      .select("display_name").eq("id", process.env.TEST_USER2)
      .then(result => result.data[0].display_name);
  });

  after((done) => {
    if (LOCAL)
      backend.kill();
    done();
  });

  afterEach(() => {
    socket1.disconnect();
    socket2.disconnect();
  })

  it("Connected user gets status of other users", (done) => {
    // connect sockets
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: false });
    socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"], rejectUnauthorized: false });

    socket2.on("connected", (msg) => {
      assert.deepEqual(msg.userStatus, [
        { user: DISPLAYNAME1, status: "Online" },
        { user: DISPLAYNAME2, status: "Online" }
      ]);
      done();
    });
  });

  it("Online user gets status when other user connects", (done) => {
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: false });

    setTimeout(() => {
      socket1.on("status", (msg) => {
        assert.deepEqual(msg, { user: DISPLAYNAME2, status: "Online" });
        done();
      });
      socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"], rejectUnauthorized: false });
    }, 500);
  });

  it("Online user gets status when other user disconnects", (done) => {
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: false });
    socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"], rejectUnauthorized: false });

    setTimeout(() => {
      socket1.on("status", (msg) => {
        if (msg.status == "Offline") {
          assert.deepEqual(msg, { user: DISPLAYNAME2, status: "Offline" });
          done();
        }
      });
      socket2.disconnect();
    }, 500);
  });

  it("Online user gets status when other user changes status", (done) => {
    socket1 = io(SERVER, { auth: { token: process.env.TEST_USER1 }, transports: ["websocket"], rejectUnauthorized: false });
    socket2 = io(SERVER, { auth: { token: process.env.TEST_USER2 }, transports: ["websocket"], rejectUnauthorized: false });

    setTimeout(() => {
      socket1.on("status", (msg) => {
        assert.deepEqual(msg, { user: DISPLAYNAME2, status: "Away" });
        done();
      });
      socket2.emit("status", { status: "Away" });
    }, 500);
  });
});