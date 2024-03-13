import { createServer } from "http";

const PORT = 1337;

createServer((req, res) => {
  res.writeHead(200);
	throw new Error("Test");
  res.end("Hey there");
}).listen(PORT, () => console.log("Server listening to", PORT));

// Error handling to keep the server on
["uncaughtException", "unhandledRejection"].forEach((event) => {
  process.on(event, (err) => {
    console.error(`Something bad happened! events: ${event}, msg: ${err.stack || err}`);
  });
});
