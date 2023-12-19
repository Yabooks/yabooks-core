const mongoose = require("mongoose");
mongoose.set("strictQuery", true);

// connect to MongoDB database
const mongoConnectionString = "mongodb://" +
    process.env.mongo_user + ":" +
    process.env.mongo_pass + "@" +
    process.env.mongo_host + ":" +
    process.env.mongo_port + "/";
mongoose.connect(mongoConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });
//let mongo = mongoose.connection.client;

module.exports = mongoose;
