const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
const { createAdapter } = require("@socket.io/redis-adapter");
const redis = require("redis");
require("dotenv").config();
const { createClient } = redis;
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

const botName = "Chat App";

let pubClient, subClient;

(async () => {
  try {
    pubClient = createClient({ url: process.env.REDIS_URL });
    pubClient.on("error", (err) => console.error("Redis PubClient Error:", err));

    await pubClient.connect();

    subClient = pubClient.duplicate();
    subClient.on("error", (err) => console.error("Redis SubClient Error:", err));

    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));
    console.log("Redis adapter connected");
  } catch (error) {
    console.error("Redis connection failed:", error);
  }
})();

// Run when client connects
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on("joinRoom", ({ username, room }) => {
    const user = userJoin(socket.id, username, room);
    socket.join(user.room);

    // Welcome current user
    socket.emit("message", formatMessage(botName, "Welcome to Chat App!"));

    // Broadcast when a user connects
    socket.broadcast
      .to(user.room)
      .emit("message", formatMessage(botName, `${user.username} has joined the chat`));

    // Send users and room info
    io.to(user.room).emit("roomUsers", {
      room: user.room,
      users: getRoomUsers(user.room),
    });
  });

  // Listen for chatMessage
  socket.on("chatMessage", (msg) => {
    const user = getCurrentUser(socket.id);
    if (user) {
      io.to(user.room).emit("message", formatMessage(user.username, msg));
    }
  });

  // Runs when client disconnects
  socket.on("disconnect", () => {
    const user = userLeave(socket.id);
    if (user) {
      io.to(user.room).emit("message", formatMessage(botName, `${user.username} has left the chat`));

      // Send users and room info
      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
