import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    // Clean up any stale or invalid legacy indexes on collections
    try {
      const usersCollection = conn.connection.collection('users');
      const indexes = await usersCollection.indexes();
      for (const idx of indexes) {
        if (idx.name.includes('friendId') || (idx.key && idx.key.friendId)) {
          console.log(`🧹 Dropping legacy index: ${idx.name}`);
          await usersCollection.dropIndex(idx.name);
        }
      }
    } catch (e) {
      // Ignore index drop errors if index doesn't exist
    }

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB error: ${err.message}`);
});

export default connectDB;
