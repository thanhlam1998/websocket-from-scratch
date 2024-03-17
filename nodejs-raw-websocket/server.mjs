import { createServer } from "http";
import crypto from "crypto";

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MASK_KEY_BYTES_LENGTH = 4;

// parseInt("10000000") = 128
const FIRST_BIT = 128;

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
  socket.on("readable", () => onSocketReadable(socket));
}

function onSocketReadable(socket) {
  // consume optcode (first byte)
  // 1 - 1 byte - 8bits
  socket.read(1);

  const [markerAndPayloadLength] = socket.read(1);
  // Because the first bit is always 1 for client-to-server messages
  // you can subtract 1 bit (128 or 10000000)
  // from this byte to get rid of the MASK bit
  const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

  let messageLength = 0;
  if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lengthIndicatorInBits;
  } else {
    throw new Error(`Your message is too long! We don't handle 64-bit message`);
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);

  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString("utf8");

  const data = JSON.parse(received);
  console.log("Message received: ", data);
}

function unmask(encodedBuffer, maskKey) {
  const finalBuffer = Buffer.from(encodedBuffer);

  for (let i = 0; i < encodedBuffer.length; i++) {
    finalBuffer[i] = encodedBuffer[i] ^ maskKey[i % 4];
  }

  return finalBuffer;
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
