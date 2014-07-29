var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var PORT = process.env.PORT || 8081;

app.get('/', function(req, res) {
  res.send('Hello world');
});

io.on('connection', function(socket){
  console.log('a user connected');
});

http.listen(PORT, function() {
  console.log("Listening on port " + PORT);
});
