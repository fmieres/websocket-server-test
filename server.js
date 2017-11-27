const
  WebSocket     = require('ws'),
  fs            = require('fs'),
  CircularJSON  = require('circular-json')
  uuid          = require('uuid/v4')
  moment        = require('moment')
;

/*
  {
    type : 'message',
    keyword : keyword,
    data : {
      .....
    }
  }
  keyword :
    ack_added_child
    ack_message_received
    added_child
    broadcast_message
*/

package = (keyword, data, uuid) => JSON.stringify({
  type : 'message' ,
  keyword : keyword,
  data : data || {},
  sender : uuid
})

noop = () => {}
logError = error => console.log(error)
tryCatch = (tryCallback, catchCallback) => {
  let returnValue
  try {
    returnValue = tryCallback()
  } catch (err) {
    val = (catchCallback || logError) (err)
  }
  return returnValue
}
function log(){ 
  console.log.apply(console, [moment().format(), ' -> ' , ...arguments])
}

const webServer = new WebSocket.Server({ port: 8090 });

webServer.on('connection', (socket,request) => {
  socket.$uuid = uuid()

  log('connection log: uuid', socket.$uuid)

  // fs.writeFileSync('./log.js', CircularJSON.stringify(socket))
  
  socket.on('message', (message) => {
    tryCatch(() =>
      processMessage_broadcastVariant(JSON.parse(message), socket, webServer)
    )
    socket.send(package('ack_message_received', message))
  })

  socket.send(package('ack_added_child', { uuid : socket.$uuid }))

  webServer.clients.forEach(client => {
    client !== socket && client.readyState === WebSocket.OPEN ?
      client.send(package('added_child', { uuid : socket.$uuid }))
      : noop()
  })
});

function processMessage_broadcastVariant(message, socket, webServer){
  webServer.clients.forEach(client => {
    client !== socket && client.readyState === WebSocket.OPEN ?
      client.send(package('broadcast', message, socket.$uuid))
      : noop()
  })
}






