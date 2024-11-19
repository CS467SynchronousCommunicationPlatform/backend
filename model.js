import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// users functions
export async function readAllUsers() {
  return await supabase
    .from('users')
    .select();
}

export async function readUser(userId) {
  return await supabase
    .from("users")
    .select()
    .eq("id", userId);
}

export async function readAllUsersInChannel(channelId) {
  return await supabase
    .from('users')
    .select('*, channels_users!inner()')
    .eq('channels_users.channel_id', channelId);
}

export async function updateUserDisplayName(userId, displayName) {
  return await supabase
    .from('users')
    .update({ display_name: displayName })
    .eq('id', userId);
}

// channels functions
export async function readAllChannelsUsers() {
  return await supabase
    .from("channels_users")
    .select();
}

export async function readAllChannelsForUser(userId) {
  return await supabase
    .from('channels')
    .select('*, channels_users!inner()')
    .eq('channels_users.user_id', userId);
}

export async function addChannels(name, description) {
  return await supabase
    .from('channels')
    .insert({ name: name, description: description })
    .select("*");
}

export async function addChannelsUsers(channelId, userId) {
  return await supabase
    .from('channels_users')
    .insert({ channel_id: channelId, user_id: userId })
}

export async function updateUnreadMessage(func, userId, channelId) {
  return await supabase
    .rpc(func, { userid: userId, channelid: channelId });
}

// messages functions
export async function readAllMessagesInChannel(channelId) {
  return await supabase
    .from('messages')
    .select('*, channels_messages!inner(), users!inner(*)')
    .eq('channels_messages.channel_id', channelId)
    .order('created_at');
}

export async function insertMessage(body, userId, createdAt, channelId) {
  // insert message
  const message_response = await supabase
    .from("messages")
    .insert({ body: body, user_id: userId, created_at: createdAt })
    .select();

  if (message_response.error)
    return message_response;

  // insert message in channel
  const channel_message_response = await supabase
    .from('channels_messages')
    .insert({ channel_id: channelId, message_id: message_response.data[0].id });

  if (channel_message_response.error)
    return channel_message_response;

  return message_response;
}
