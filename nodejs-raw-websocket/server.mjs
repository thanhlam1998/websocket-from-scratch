import { createServer } from "http";

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
import crypto from "crypto";

const server = createServer((req, res) => {
  res.writeHead(200);
  res.end("Hey there");
}).listen(PORT, () => console.log("Server listening to", PORT));

server.on("upgrade", onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
  const { "sec-websocket-key": webClientSocketKey } = req.headers;
  console.log(`${webClientSocketKey} connected!`);

  const headers = prepareHandShakeHeaders(webClientSocketKey);

  socket.write(headers);
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id);
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
  ]
    .map((line) => line.concat("\r\n"))
    .join("");

  return headers;
}

function createSocketAccept(id) {
  const shaum = crypto.createHash("sha1");
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY);
  return shaum.digest("base64");
}

// Error handling to keep the server on
["uncaughtException", "unhandledRejection"].forEach((event) => {
  process.on(event, (err) => {
    console.error(`Something bad happened! events: ${event}, msg: ${err.stack || err}`);
  });
});
