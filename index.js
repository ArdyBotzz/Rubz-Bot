const baileys = require('@adiwajshing/baileys');
const Pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require("path");

let setting = {
  owner: ["6287883322093@s.whatsapp.net"]
}

let pluginsFolder = path.join(__dirname, 'plugins')
let pluginsFilter = filename => /\.js$/.test(filename)
global.plugins = {}
for (let filename of fs.readFileSync(pluginsFolder).filter(pluginsFilter)) {
  try {
    global.plugins[filename] = require(path.join(pluginsFolder, filename))
  } catch (e) {
    console.log(e)
    delete global.plugins[filename]
  }
}
console.log(Object.keys(global.plugins))

async function start(sesion) {
  const { state, saveState } = baileys.useSingleFileAuthState(sesion);
  const sock = baileys.default({
    printQRInTerminal: true,
    logger: Pino({level: 'silent'}),
    auth: state
  });
  const store = baileys.makeInMemoryStore({
    logger: Pino().child({level:'silent',stream:'store'})
  });
  store.bind(sock.ev)
  sock.ev.on("connection.update", update => {
    const { connection, lastDisconnect } = update;
    if (connection == 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== baileys.DisconnectReason.loggedOut
      console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
      if (shouldReconnect) {
        start(sesion)
      }
    } else if (connection == "open") {
      console.log('Connect')
    }
  });
  sock.ev.on('creds.update', saveState);
  sock.ev.on('contacts.update', contacts => {
    for (let contact of contacts) {
      let id = contact.id;
      let name = contact.notify;
      if (store && store.contacts) {
        let newContact = {
          id,
          name
        };
        store.contacts[id] = newContact;
      };
    };
  });
  sock.ev.on("messages.upsert", async (message) => {
    await require("./plugins.js").handler(message, sock, store, setting)
  });
};

start('./session.json')