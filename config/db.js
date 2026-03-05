const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    let conn;

    const resolvedMongoUri = process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
    if (!resolvedMongoUri) {
      throw new Error('MongoDB URI is not configured. Set MONGODB_URI or MONGODB_ATLAS_URI.');
    }

    conn = await mongoose.connect(resolvedMongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
