const mongoose = require('mongoose');

// Connect to MongoDB database
mongoose.connect('mongodb://127.0.0.1:27017/realtime-chat')
  .then(() => console.log('Connected!'));

const Schema = mongoose.Schema;

// Define the messages schema
const messagesSchema = new Schema({
  message: String,
  username: String,
  timestamp: String
});

// Define the room schema
const roomSchema = new Schema({
    name: String,
    id: String,
    ownerEmail: String,
})

// Define the room model
const roomModel = mongoose.model('rooms', roomSchema)

// Define helper function to return the messages model based on room id
async function getMessagesModel(roomID){
    return mongoose.model(`${roomID}-messages`, messagesSchema);
}

// Export info for imports
module.exports = {
    getMessagesModel,
    roomModel
}