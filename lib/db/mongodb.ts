import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI environment variable is not defined!");
  console.error("Please add MONGODB_URI to your .env.local file");
  console.error("Example: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name");
  throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
}

// Validate MongoDB URI format
if (!MONGODB_URI.startsWith('mongodb://') && !MONGODB_URI.startsWith('mongodb+srv://')) {
  console.error("❌ Invalid MONGODB_URI format!");
  console.error("MongoDB URI should start with 'mongodb://' or 'mongodb+srv://'");
  console.error("Current value:", MONGODB_URI);
  throw new Error("Invalid MONGODB_URI format. Must start with 'mongodb://' or 'mongodb+srv://'");
}

declare global {
  var mongoose: any;
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds timeout
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    }).catch((error) => {
      console.error("❌ MongoDB connection failed:");
      console.error("Error:", error.message);
      console.error("Code:", error.code);
      console.error("\nTroubleshooting:");
      console.error("1. Check your MongoDB URI format");
      console.error("2. Ensure your MongoDB cluster is running");
      console.error("3. Check your network connection");
      console.error("4. Verify your MongoDB credentials");
      console.error("5. Make sure your IP is whitelisted in MongoDB Atlas");
      throw error;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
