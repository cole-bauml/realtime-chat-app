const express = require('express');
const app = express();
const server = require('http').createServer(app); // Create HTTP server
const io = require('socket.io')(server); // Connect socket to HTTP server

app.set('trust proxy', 1) // trust first proxy
var bodyParser = require('body-parser') // Parse req.body object

const { getMessagesModel, roomModel } = require('./database'); // Import all Mongo DB database models

app.set('view engine', 'ejs'); // Allow views to end in file extension .ejs
app.set('views', __dirname + '\\public'); // Change views directory
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false })) // Apply the body-parser middleware

// parse application/json
app.use(bodyParser.json()) // Apply the body-parser middleware

// Render the home page
app.get('/', (req, res) => {
    res.render('index')
})
// Render the chat page
app.get('/chat', (req, res) => {
    var currentTime = getTime() // Get the time of page load
    res.render('room', { currentTime }) // Send to the client for Timmy (Bot)
})
// Render the join page
app.get('/join', (req, res) => {
    res.render('join')
})
// Render the create page
app.get('/create', (req, res) => {
    res.render('create')
})

// ONLY ENABLE FOR BUG TESTING!! DO NOT LEAVE ON FOR SECURITY REASONS!
app.get('/rooms.json', async (req, res) => {
    var enabled = true;
    if (enabled) {
        var rooms = await roomModel.find();
        res.send(rooms)
    }
    else{
        res.send('This feature is not avaliable to the public right now for security reasons.')
    }
})
// Helper function to format timestamps for clients and database
function getTime() {
    var currentDate = new Date();

    let hours;
    let minutes;
    let timeOfDay;
    let dayOfMonth;
    let month;

    // Check if the current hour is greater than 12
    var hoursOffset = +3; // Change offset if your computer is behind or ahead in hours of your target audience. No offset is 0.
    // Offset of 0 is no offset.
    // Behind three hours means you would add 3 to the total, so +3 would be the offset if you are behind 3.
    // Ahead 3 hours you would subtract 3 so -3 is the offset.


    var unformattedHours = parseInt(currentDate.getHours() + hoursOffset);
    if (unformattedHours > 12) {
        hours = unformattedHours - 12;
        timeOfDay = "PM";
    }
    else if (unformattedHours == 12) {
        hours = unformattedHours
        timeOfDay = "PM";
    }
    else if (unformattedHours === 0) {
        hours = 12;
        timeOfDay = "AM";
    }
    else {
        hours = unformattedHours
        timeOfDay = "AM";
    }

    var unformattedMinutes = currentDate.getMinutes().toString();

    if (unformattedMinutes.length == 1) {
        minutes = `0${unformattedMinutes}`
    }
    else {
        minutes = unformattedMinutes
    }

    var unformattedDate = currentDate.getDate();

    if (unformattedDate.length = 1) {
        dayOfMonth = `0${unformattedDate}`
    }
    else {
        dayOfMonth = unformattedDate
    }



    var unformattedMonth = parseInt(currentDate.getMonth());

    if (unformattedMonth.length = 1) {
        month = `0${unformattedMonth + 1}`
    }
    else {
        month = unformattedMonth + 1
    }


    return `${dayOfMonth}/${month}/${currentDate.getFullYear()} ${hours}:${minutes} ${timeOfDay}`
}

var users = []
// Listen for the clients socket
io.on('connection', async (socket) => {
    var socketUsername;
    var socketRoom;

    // Client has requested to create a room
    socket.on('create-room', async (roomData) => {
        var code = roomData.roomID;
        var name = roomData.name;
        var room = new roomModel({
            name: name,
            id: code
        })

        if (name && code) {
            // If name and code present, save the room to the database
            room.save()

            var code = roomData.roomID;
            socket.emit('created', code)
        }
        else {
            // Not all fields present, do not save
            var error = "Please fill out all fields."
            socket.emit('error-creating', error)
        }

    })
    // Client requested to check if a room exists when joining
    socket.on('check-room', async (roomID) => {
        var results = await roomModel.find({ id: roomID }); // Scan the database for the requested room
        if (results.length > 0) {
            // Room exists, notify client
            socket.emit('room-approved', roomID)

        }
        else {
            // Room does not exist.
            var error = "Room does not exist."
            socket.emit('invalid-room', error)
        }
    })
    // Client has requested to join room
    socket.on('join', async (roomID, username) => {
        socketUsername = username
        socketRoom = roomID;
        var results = await roomModel.find({ id: roomID }); // Scan the database for the requested room
        if (results.length > 0) {
            // Room exists, join the room and notify the client
            socket.join(roomID)
            var info = {
                name: results[0].name
            }

            socket.emit('joined', info)

            users.push({ username: socketUsername, room: roomID });

            sendUsers();

            var contents = `User "${username}" has connected to the chat.`
            timmyBotMessage(contents, roomID, username)

        }
        else {
            // Room does not exist
            var error = "Room does not exist."
            socket.emit('invalid-room', error)
        }
    })

    // Client requested messages in the room
    socket.on('request-messages', async (roomID) => {
        const isInRoom = io.sockets.adapter.rooms.get(roomID) && io.sockets.adapter.rooms.get(roomID).has(socket.id); // Verify the client is in the room
        if (isInRoom) {
            const messagesModel = await getMessagesModel(roomID)
            var messages = await messagesModel.find(); // Scan the database for the messages
            socket.emit('messages', messages) // Send the client the messages
        }
    })

    // User requested to send message
    socket.on('send-message', async (data) => {
        // Define message information
        const roomID = data.roomID;
        const message = data.message;
        const username = data.username;
        const isInRoom = io.sockets.adapter.rooms.get(roomID) && io.sockets.adapter.rooms.get(roomID).has(socket.id); // Verify socket is in the requested room
        // Validate all values present
        if (isInRoom && roomID && message) {
            // Save to the database
            const messagesModel = await getMessagesModel(roomID)
            var timestamp = getTime();
            var serverMessage = new messagesModel({
                message: message,
                username: username,
                timestamp
            })
            serverMessage.save();

            // Define client message variable
            var clientMessage = {
                message: message,
                username: username,
                timestamp
            }
            io.in(roomID).emit('new-message', { clientMessage }); // Send client special client message
        }
        else {
            socket.emit('message-send-error') // Emit error if not all requirments are met.
        }

    })

    // Client started typing
    socket.on('typing', (username, roomID) => {
        io.in(roomID).emit('typing', username) // Notify all clients in the room that client has started typing
    })

    // Helper function to send Timmy Bot message
    async function timmyBotMessage(contents, roomID, username) {
        var message = {
            timestamp: getTime(),
            contents,
            username
        }
        io.in(roomID).emit('timmy-bot-message', (message))
    }

    // Helper function to send users to clients
    function sendUsers() {
        const usersInRoom = users.filter(user => user.room === socketRoom);

        io.in(socketRoom).emit('users', (usersInRoom))
    }

    // Disconnect socket trigger to send Timmy bot message
    socket.on('disconnect', () => {
        if (socketRoom && socketUsername) {
            const oldUser = users.findIndex(user => user.username === socketUsername);
            if (oldUser !== -1) {
                users.splice(oldUser, 1);
                sendUsers();
            }
            var contents = `User "${socketUsername}" has disconnected from the chat.`
            timmyBotMessage(contents, socketRoom, socketUsername)
        }

    })
})



const port = 3000; // Port the app runs on
// Start listening on the port defined
server.listen(port, () => {
    console.log("Server started and listening at port: " + port)
})


// STATIC FILES
app.get('/main.css', (req, res) => {
    res.sendFile(__dirname + `\\public\\css\\main.css`)
})
app.get('/fonts/Roboto.ttf', (req, res) => {
    res.sendFile(__dirname + `\\public\\fonts\\Roboto.ttf`)
})
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(__dirname + '\\public\\js\\socket.io.min.js')
})

// TIMMY BOT'S AVATAR
app.get('/timmy-bot-avatar.png', (req, res) => {
    res.sendFile(__dirname + '\\public\\img\\timmy-bot-avatar.png')
}) 