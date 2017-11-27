//Create an account on Firebase, and use the credentials they give you in place of the following



var webSocket = new WebSocketClient('ws://localhost:8090')
webSocket.connect().then(console.log, console.log )
var database = undefined//firebase.database().ref();
var yourVideo = document.getElementById("yourVideo");
var friendsVideo = document.getElementById("friendsVideo");
var yourId = Math.floor(Math.random()*1000000000);
var servers = {
  iceServers: [
    {'urls': 'turn:186.137.128.81', credential : 'youhavetoberealistic', username :'fmieres'}
  ]
};

var pc = new RTCPeerConnection(servers);
var sendChannel = pc.createDataChannel('sendDataChannel', null)
/*pc.ondatachannel = function (event){
  receiveChannel = event.channel;
  receiveChannel.onmessage = message => console.log('message received by datachannel:', message);
  //receiveChannel.onopen = onReceiveChannelStateChange;
  //receiveChannel.onclose = onReceiveChannelStateChange;
}*/

pc.onicecandidate = (event => 
  event.candidate 
  ? sendMessage({'ice':event.candidate})
  : console.log("Sent All Ice", event));

pc.onaddstream = (event => friendsVideo.srcObject = event.stream);

//var sendMessage = (senderId, data) => database.push({ sender: senderId, message:  data }).remove();
var sendMessage = webSocket.send //console.log();

function readMessage(msg, sender) {
  console.log('read message', msg, sender)
  
    /*if (msg.type)
       receiveMessage(msg)
    else*/ 
  if (msg.ice != undefined)
    pc.addIceCandidate(new RTCIceCandidate(msg.ice));
  else if ( msg.sdp && msg.sdp.type == "offer")
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      .then(() => pc.createAnswer())
      .then(answer => pc.setLocalDescription(answer))
      .then(() => sendMessage({'sdp': pc.localDescription}));
  else if (msg.sdp && msg.sdp.type == "answer")
    pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  else {
    console.log('wasnt expecting:', msg)
  }
};

//database.on('child_added', data => (val => readMessage(JSON.parse(val.message), val.sender)) (data.val()) );
webSocket.on('broadcast', readMessage)
webSocket.on('ack_message_received', () => {})

function showMyFace() {
  navigator.mediaDevices.getUserMedia({audio:false, video:true})
    .then(stream => yourVideo.srcObject = stream)
    .then(stream => pc.addStream(stream));
}

function showFriendsFace() {
  pc.createOffer()
    .then(offer => pc.setLocalDescription(offer) )
    .then(() => sendMessage({'sdp': pc.localDescription}) );
}

function sendHelloWorld() {}
function receiveMessage(data){alert(data.message)}

function WebSocketClient(url){
  me = this
  
  me.url = url
  me.$register = {
    ack_added_child : data => me.uuid = data.uuid
  }
  
  me.connect = connect
  me.onMessage = onMessage
  me.on = on
  me.send = send
  
  function send(aStructure){
    me.$server.send(JSON.stringify(aStructure))
  }
  
  function noop(a,b){ console.log('noop', a,b) }
  function on(keyword, callback)     { me.$register[keyword] = callback }
  function onMessage(onMessageAction){ me.$server.onmessage = onMessageAction || onMessageActionDefault }
  function simpleSend(message){ me.$server.send(message) }
  
  function onMessageActionDefault(messageEvent){
    var data = JSON.parse(messageEvent.data)
    return data.keyword ?
        (me.$register[data.keyword] || noop)(data.data, data.sender, messageEvent) 
      : noop(messageEvent)
  }
  
  function connect (){
    return new Promise(function(resolve, reject) {
      me.$server           = new WebSocket(url)
      me.$server.onmessage = onMessageActionDefault
      me.$server.onopen    = function() { resolve(me.$server) }
      me.$server.onerror   = function(err) { reject(err) }
    });
  }
}