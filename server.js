const
  WebSocket     = require('ws'),
  fs            = require('fs'),
  //CircularJSON  = require('circular-json')
  uuid          = require('uuid/v4'),
  moment        = require('moment'),
  express        = require('express')
;

const
  ACK_ADDED_CHILD            = 'ack_added_child',
  ACK_MESSAGE_RECEIVED       = 'ack_message_received',
  BROADCAST_MESSAGE          = 'broadcast_message',
  ASK_TAKE_CALL              = 'ask_take_call',
  ASSERT_ADDED_CHILD         = 'assert_added_child',
  ASSERT_ASKED_LISTENER      = 'assert_asked_listener',
  ASSERT_NO_SPEAKER          = 'assert_no_speaker',
  ASSERT_NO_FREE_LISTENER    = 'assert_no_free_listener',
  ASSERT_NO_ONLINE_LISTENER  = 'assert_no_online_listener',
  ASSERT_CONNECTED_WITH_PAIR = 'assert_connected_with_pair'
  ASSERT_NEGOTIATION_LOST    = 'assert_negotiation_lost'
  ASSERT_NEGOTIATION_FAILED  = 'assert_negotiation_failed',
  ESTABLISHED                = 'state_established,'
  WAITING                    = 'state_waiting',
  NOTICE                     = 'state_notice',
  SPEAKER                    = 'speaker',
  LISTENER                   = 'listener',
  CHANNEL_WEBRTC             = 'channel_webrtc',
  QUEUE_AS_LISTENER          = 'queue_as_listener',
  QUEUE_AS_SPEAKER           = 'queue_as_speaker',
  ACCEPT_SPEAKER             = 'accept_speaker',
  ASSERT_DISSCONNECTED_PAIR  = 'assert_dissconnected_pair'

;

package = (keyword, data, uuid) => JSON.stringify({
  type : 'message' ,
  keyword : keyword,
  data : data || {},
  sender : uuid
})

noop = () => {}
logError = error => console.log(error)
tryCatch = (tryCallback, catchCallback) => {
  let return_value
  try {
    return_value = tryCallback()
  } catch (err) {
    val = (catchCallback || logError) (err)
  }
  return return_value
}

function log(){ 
  console.log.apply(console, ['                                                       ',moment().format(), ' -> ' , ...arguments])
}
function logLeft(){
  console.log.apply(console, [moment().format(), ' -> ' , ...arguments])
}

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

const server = express()
  .use((req, res) => res.sendFile(INDEX) )
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));


const WEB_SERVER = new WebSocket.Server({ server });
// const WEB_SERVER = new WebSocket.Server({ port: 3000 });
WEB_SERVER.$listeners = []
WEB_SERVER.$speakers = []
WEB_SERVER.$listeners_in_use = {}

setInterval(() => logLeft('####### listeners ',WEB_SERVER.$listeners.map(x => ({ uuid : x.socket.$uuid }) ), '#######'), 5000)
setInterval(() => logLeft('####### speakers ', WEB_SERVER.$speakers .map(x => ({ uuid : x.socket.$uuid }) ), '#######'), 5000)
setInterval(() => logLeft('####### in_use ',[...(new Set(Object.values(WEB_SERVER.$listeners_in_use)))].map(x=> { return {listener : x.listener.$uuid, speaker : x.speaker.$uuid, speaker_state : x.speaker_state, listener_state : x.listener_state}}), '#######'), 5000);


WEB_SERVER.on('connection', (socket,request) => {
  socket.$uuid = uuid()
  log('connection log: uuid', socket.$uuid)
  
  socket.on('message', (message) => {
    tryCatch( () => processMessage(socket, JSON.parse(message)) )
    socket.send(package(ACK_MESSAGE_RECEIVED, message.data))
  })

  socket.on('close', (a,b,c) => {
    tryCatch(() => processClose(socket, a,b,c))
    // podemos hacer metricas con closed socket
  })

  socket.send(package(ACK_ADDED_CHILD, { uuid : socket.$uuid }))

  WEB_SERVER.clients.forEach(client => {
    client !== socket && client.readyState === WebSocket.OPEN ?
      client.send(package(ASSERT_ADDED_CHILD, { uuid : socket.$uuid }))
      : noop()
  })
});

function processMessage(sender, message){
  log('message received from: ', sender.$uuid, ' - ', message)

  let actions = {
    server    : () => handleServerCall(sender, message.data),
    webrtc    : () => handleWebRTCCall(sender, message.data),
    'default' : () => (() => log('unknown call type', message.type))()
  }
  
  return (actions[message.type] || actions.default)()
}

function handleServerCall(sender, data){
  let actions = {}
  actions[QUEUE_AS_LISTENER] = () => queueAsListener(sender, data),
  actions[QUEUE_AS_SPEAKER]  = () => queueAsSpeaker(sender, data),
  actions[ACCEPT_SPEAKER]    = () => acceptSpeaker(sender, data),
  actions.default            = () => (() => log('unknown call type', data.type))()
  
  return (actions[data.type] || actions.default) ()
}

function handleWebRTCCall(sender, data) {
  let target = getTargetOfSender(sender)
  if (target) {
    console.log('log handle!!!!!!!!!!!: ',target.$uuid, sender.$uuid, data);
    target.send(package(CHANNEL_WEBRTC, data, sender.$uuid ))
  } else {
    sender.send(package(ASSERT_NEGOTIATION_LOST, {}, sender.$uuid))
  }
}

function getTargetOfSender(sender){
  console.log('log: ',sender.$uuid, sender.$type,"---------------------------------------------------");
  let negotiation = WEB_SERVER.$listeners_in_use[sender.$uuid]
  console.log('log: #############', (negotiation ? 'found' : 'not found'));
  return negotiation ? negotiation[sender.$type === LISTENER ? SPEAKER : LISTENER  ] : negotiation
}

function inUseItem(speaker, speakerState, listener, listenerState){
  return {
    listener  : listener,
    speaker   : speaker,
    timestamp_creation : moment(),
    speaker_state : speakerState,
    listener_state : listenerState
  }
}

function addItemToListenersInUse(speaker, speakerState, listener, listenerState){
  let item = inUseItem(speaker, speakerState, listener, listenerState)
  WEB_SERVER.$listeners_in_use[listener.$uuid] = item
  WEB_SERVER.$listeners_in_use[speaker.$uuid] = item
}

function queueAsListener(listener, data){
  listener.$type = LISTENER
  let speaker = WEB_SERVER.$speakers.pop()
  if (speaker){
    addItemToListenersInUse(speaker.socket, NOTICE, listener, WAITING)
    listener.send(package(ASK_TAKE_CALL, speaker.profile, speaker.socket.$uuid))
    speaker .send(package(ASSERT_ASKED_LISTENER, {}, listener.$uuid))
  } else {
    listener.send(package(ASSERT_NO_SPEAKER, { current_speakers : WEB_SERVER.$speakers.length }, listener.$uuid))
    WEB_SERVER.$listeners.push({ socket : listener, timestamp : moment() })
  }
}

function queueAsSpeaker(speaker, data){
  speaker.$type = SPEAKER
  let listener = WEB_SERVER.$listeners.pop() // posible cambio de estrategia, obtener el más viejo ? 
  if (listener){
    addItemToListenersInUse(speaker, WAITING, listener.socket, NOTICE)
    listener.socket.send(package(ASK_TAKE_CALL, data.profile, speaker.$uuid))
    speaker        .send(package(ASSERT_ASKED_LISTENER, {}, listener.socket.$uuid))
  } else {
    WEB_SERVER.$speakers.push({ socket : speaker, timestamp : moment(), profile : data.profile})
    speaker.send(package(
      WEB_SERVER.$listeners_in_use.length > 0 ? ASSERT_NO_FREE_LISTENER : ASSERT_NO_ONLINE_LISTENER, 
      { total_listeners : WEB_SERVER.$listeners_in_use.length },
      speaker.$uuid
    ))
  }
}

function acceptSpeaker(listener, data){
  let negotiation = WEB_SERVER.$listeners_in_use[listener.$uuid]
  if (negotiation && negotiation.speaker_state === WAITING) {
    Object.assign(negotiation, { speaker_state : ESTABLISHED, listener_state : ESTABLISHED } )
    negotiation.listener.send(package(ASSERT_CONNECTED_WITH_PAIR, { target : negotiation.speaker.$uuid  }, negotiation.speaker.$uuid))
    negotiation.speaker .send(package(ASSERT_CONNECTED_WITH_PAIR, { target : negotiation.listener.$uuid }, negotiation.speaker.$uuid))
  } else {
    listener.send(package(ASSERT_NEGOTIATION_FAILED, {}, listener.$uuid))
    WEB_SERVER.$listeners.push({ socket : listener, timestamp : moment()})
  }
}

function processClose(socket){
  log('closed,', socket.$uuid);
  let queue_name = socket.$type === LISTENER ? '$listeners' : '$speakers'
  let index = WEB_SERVER[queue_name].findIndex(item => item.socket === socket)
  if (index >= 0) WEB_SERVER[queue_name].splice(index,1)
  let negotiation = WEB_SERVER.$listeners_in_use[socket.$uuid]
  if (negotiation && !negotiation.is_cancelling) {
    negotiation.is_cancelling = true
    let removeUuid = uuid => delete WEB_SERVER.$listeners_in_use[uuid]
    let pair_type = socket.$type === LISTENER ? SPEAKER : LISTENER
    let pair = negotiation[pair_type];
    [socket.$uuid, pair.$uuid].forEach(removeUuid)
    pair.send(package(ASSERT_DISSCONNECTED_PAIR, {}, pair.$uuid))
  }




}