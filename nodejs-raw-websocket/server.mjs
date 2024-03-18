import { createServer } from "http";
import crypto from "crypto";

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const MAXIMUM_SIXTEENBITS_INTEGER = 2 ** 16; // 0 to 65536
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01; // 1 bit in binary

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

function sendMessage(msg, socket) {
  const dataFrameBuffer = prepareMessage(msg);
  socket.write(dataFrameBuffer);
}

function prepareMessage(message) {
  const msg = Buffer.from(message);
  const messageSize = msg.length;

  let dataFrameBuffer;

  // 0x80 === 120 in binary
  // '0x' + Math.abs(128).toString(16);
  const firstByte = 0x80 | OPCODE_TEXT; // single frame + text
  if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte];
    dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
  } else if (messageSize <= MAXIMUM_SIXTEENBITS_INTEGER) {
    let offset = 4;
    const target = Buffer.allocUnsafeSlow(offset);
    target[0] = firstByte;
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0; // just to know the mask

    target.writeUint16BE(messageSize, 2); // Content length is 2 bytes
    dataFrameBuffer = target;

    // allow 4 bytes
    // [0] - 129 + 1 - 10000001 = 0x81 fin + opcode
    // [1] - 126 + 0 - payload length marker + mask indicator
    // [2] 0 - content length
    // [3] 171 - content length
    // [4 - ...] - the message itself
  } else {
    throw new Error("Message too long :(");
  }
  const totalLength = dataFrameBuffer.byteLength + messageSize;
  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength);
  return dataFrameResponse;
}

function concat(bufferList, totalLength) {
  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (const buffer of bufferList) {
    target.set(buffer, offset);
    offset += buffer.length;
  }

  return target;
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
  } else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
    // unsigned big-endian 16-bit integer [0 - 55K] - 2 ** 16
    messageLength = socket.read(2).readUint16BE(0);
  } else {
    throw new Error(`Your message is too long! We don't handle 64-bit message`);
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);

  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString("utf8");

  const data = JSON.parse(received);
  console.log("Message received: ", data);

  const msg = JSON.stringify({
    message: data,
    at: new Date().toISOString(),
  });

  sendMessage(msg, socket);
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
