const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s
      socketTimeoutMS: 45000,         // Close sockets after 45s
    });
    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`❌ MongoDB Atlas Connection Error: ${error.message}`);
    console.error('👉 Check your MONGO_URI in .env file');
    process.exit(1);
  }
};

module.exports = connectDB;
