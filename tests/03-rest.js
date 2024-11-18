import dotenv from "dotenv";
import { assert } from "chai";
import fetch from "node-fetch";
import { Agent } from "node:https";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

const LOCAL = process.env.DEPLOYED === undefined
const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;

describe("REST API Tests", () => {
  const agent = LOCAL ? new Agent({ rejectUnauthorized: false }) : undefined;

  let supabase, userId, channelId, channelId2

  before(async () => {
    // connect to db
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // define constants
    userId = "0b139386-a0e1-4f4c-81ba-5e0241b8cd19";
    channelId = 37;
    channelId2 = 36;
  });

  it("/ server status", async () => {
    await fetch(SERVER, { agent: agent }).then(resp => {
      assert.equal(resp.status, 200);
      return resp.text();
    }).then(text => {
      assert.equal(text, "Backend REST API running");
    });
  });

  it("Invalid endpoint error", async () => {
    await fetch(`${SERVER}/bad`, { agent: agent }).then(resp => {
      assert.equal(resp.status, 400);
      return resp.json();
    }).then(json => {
      assert.deepEqual(json, { "Error": "Invalid method or endpoint: GET https://localhost/bad" });
    });
    
  });

  // test for insert channel endpoint
  function defineReq(method, body) {
    let req = {
      agent: agent,
      headers: { "Content-Type": "application/json" },
      method: method,
      body: body
    }
    return req
  }

  it("Insert channel", async () => {
    let body = JSON.stringify({ name: "General Chat", description: "Channel insert test" });
    await fetch(`${SERVER}/channels`, defineReq("POST", body)).then(resp => { 
      assert.equal(resp.status, 201);
    });

    // delete test row
    const { data } = await supabase
      .from('channels')
      .select("id")
      .order('id', { ascending: false })
      .limit(1)

    const response = await supabase
      .from('channels')
      .delete()
      .eq('id', data[0].id)
  });

  it("Insert channel missing name", async () => {
    let body = JSON.stringify({ description: "Channel insert test" })
    await fetch(`${SERVER}/channels`, defineReq("POST", body)).then(resp => {
      assert.equal(resp.status, 400);
    });
  });

  it("Insert channel missing description", async () => {
    let body = JSON.stringify({ name: "Channel insert test" })
    await fetch(`${SERVER}/channels`, defineReq("POST", body)).then(resp => {
      assert.equal(resp.status, 400);
    });
  });

  // test for notifications update
  async function getUnread(channel) {
    const { data, error, status } = await supabase
    .from('channels_users')
    .select('unread')
    .eq('user_id', userId)
    .eq('channel_id', channel)
    
    return data[0].unread;
  };

  it("Increment unread notifications", async () => {
    let body = JSON.stringify({ 
      function: "incrementnotifications",
      userId: userId,
      channelId: channelId
    });
    await fetch(`${SERVER}/notifications`, defineReq("PUT", body)).then(resp => {
      assert.equal(resp.status, 204);
    });
    assert.equal(await getUnread(channelId), 1);

    // reset unread value
    await supabase.from('channels_users').update({ unread: 0 }).eq('user_id', userId).eq('channel_id', channelId);
  });


  it("Clear unread notifications", async () => {
    let body = JSON.stringify({
      function: "clearnotifications",
      userId: userId,
      channelId: channelId2
    });
    await fetch(`${SERVER}/notifications`, defineReq("PUT", body)).then(resp => {
      assert.equal(resp.status, 204);
    });
    assert.equal(await getUnread(channelId2), 0);
    
    // reset unread value
    await supabase.from('channels_users').update({ unread: 1 }).eq('user_id', userId).eq('channel_id', channelId2);
  });

  it("Invalid function", async () => {
    let body = JSON.stringify({ function: "notafunction" });
    await fetch(`${SERVER}/notifications`, defineReq("PUT", body)).then(resp => {
      assert.equal(resp.status, 404);
    });
  });
  
});