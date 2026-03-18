import mongoose from "mongoose";

const connectDB = async () => {
    try {
        // Remove deprecated options (useNewUrlParser, useUnifiedTopology)
        // These are default in MongoDB Driver v4.0.0+
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
            socketTimeoutMS: 45000,
            maxPoolSize: 10, // Maintain up to 10 socket connections
            maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        });

        console.log(`✅ MongoDB Connected successfully to: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error.message);
        console.error("🔍 Check your MONGO_URI in .env file");
        console.error("🌐 Ensure your IP is whitelisted in MongoDB Atlas");
        console.error("🔑 Verify your MongoDB credentials");
        process.exit(1); // Exit process with failure
    }
};

export default connectDB;