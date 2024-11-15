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

  let supabase;

  before(async () => {
    // connect to db
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
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
  function definePost(body) {
    let req = {
      agent: agent,
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: body
    }
    return req
  }

  it("Insert channel", async () => {
    let body = JSON.stringify({ name: "General Chat", description: "Channel insert test" });
    await fetch(`${SERVER}/channels`, definePost(body)).then(resp => { 
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
    await fetch(`${SERVER}/channels`, definePost(body)).then(resp => {
      assert.equal(resp.status, 400);
    });
  });

  it("Insert channel missing description", async () => {
    let body = JSON.stringify({ name: "Channel insert test" })
    await fetch(`${SERVER}/channels`, definePost(body)).then(resp => {
      assert.equal(resp.status, 400);
    });
  });

  // test for insert message
});