const mongoose = require("mongoose");
mongoose.set("strictQuery", true);

// connect to MongoDB database
mongoose.connect(require("./config.js").mongoUri(), { useNewUrlParser: true, useUnifiedTopology: true });

module.exports = mongoose;
