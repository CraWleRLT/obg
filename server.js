/*
 * Basic Node.js express server that runs a socket.io instance
 * to mirror all data sent by one client to all others (in the same
 * socket.io room)
 */


/*
 * Helper Functions
 */
function extend(a,b) {
    var k;
    for (k in b) {
        a[k] = b[k];
    }
    return a;
}



var PORT = 3000;

// Preliminaries
var express = require('express');
var app = express();
var http = require('http');
var server = http.createServer(app);
var io = require('socket.io').listen(server);

// Statically server pages from the public directory
app.configure( function() {
    app.use(express.static(__dirname + '/public'));
});

// Start the server
server.listen(PORT);
console.log('Server listening on port ' + PORT);



// Handle all the websocket connections
io.sockets.on('connection', function(socket) {
    // initialize the socket object to store some persistent data
    socket.hanabiData = {};

    /*
     * Helper Functions
     */

    // return information on all clients in a particular room.
    //      roomList: list of all rooms on the server
    //      clientList: list of objects, each containing the name of
    //                  the client and a unique identifier for that
    //                  client (which can be used to identify yourself)
    function getRoomInfo (room) {
        var clientList = [];
        for (var i = 0, clients = io.sockets.clients(room); i < clients.length; i++) {
            clientList.push({name: clients[i].hanabiData.name, id: clients[i].id, data: clients[i].hanabiData});
        }

        var info = {
            roomList: Object.keys(io.sockets.manager.rooms),
            clients: clientList,
        };
        return info;
    }

    function informRoomOfChange (room) {
        if (room == null) {
            return;
        }
        // loop through all clients in this room and push them updated info
        // about th people in their room
        var info = getRoomInfo(room)
        for (var i = 0, clients = io.sockets.clients(room); i < clients.length; i++) {
            clients[i].emit('room-info', info);
        }

    }


    /*
     * Event handlers
     */

    socket.on('disconnect', function () {
        console.log('Disconnecting Client', socket.hanabiData.currentRoom);
        // force ourselves to leave the room before the room
        // statistics get broadcast to the other people in the room!
        if (socket.hanabiData.currentRoom) {
            socket.leave(socket.hanabiData.currentRoom);
        }
        informRoomOfChange(socket.hanabiData.currentRoom);
    });

    // rooms allow us to limit our broadcasts to others in the same room.
    socket.on('set-room', function(room) {
        console.log('Joining room', room);
        // leave any previous room we may have been in
        if (socket.hanabiData.currentRoom) {
            socket.leave(socket.hanabiData.currentRoom);
        }
        socket.join(room);

        var oldRoom = socket.hanabiData.currentRoom;
        socket.hanabiData.currentRoom = room;
        // inform about our room change
        // to both the old room and the new room
        if (oldRoom) {
            informRoomOfChange(oldRoom);
        }
        if (oldRoom != room) {
            informRoomOfChange(room)
        }
    });
    socket.on('query-room', function (room) {
        console.log('Querying room', room);
        socket.emit('room-info', getRoomInfo(room));
    });
    socket.on('query-id', function () {
        socket.emit('id-info', {name: socket.hanabiData.name, id: socket.id, currentRoom: socket.hanabiData.currentRoom});
    });

    // set a new name for the client
    socket.on('set-name', function (name) {
        console.log('Setting name from', socket.hanabiData.name, ' to ', name);
        socket.hanabiData.name = name;
        informRoomOfChange(socket.hanabiData.currentRoom);
    });

    // set a new data for the client
    socket.on('set-data', function (data) {
        console.log('Setting data', data);
        extend(socket.hanabiData, data);
        informRoomOfChange(socket.hanabiData.currentRoom);
    });

    // when new data is broadcast by a client, emit it to all
    // other clients in the same room
    socket.on('broadcast', function (data) {
        console.log('Got message to retransmit', data, 'room: ', socket.hanabiData.currentRoom);
        var room = socket.hanabiData.currentRoom;
        // everyone in the same room as the broadcaster will get the data
        // relayed to them
        socket.in(room).broadcast.emit('message', {message: data, senderId: socket.id});
    });
});