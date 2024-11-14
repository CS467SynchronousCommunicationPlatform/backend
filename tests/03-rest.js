import dotenv from "dotenv";
import { assert } from "chai";
import fetch from "node-fetch";
import { Agent } from "node:https"
dotenv.config();

const LOCAL = process.env.DEPLOYED === undefined
const SERVER = LOCAL ? "https://localhost" : process.env.DEPLOYED_URL;

describe("REST API Tests", () => {
  const agent = LOCAL ? new Agent({ rejectUnauthorized: false }) : undefined;

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
});