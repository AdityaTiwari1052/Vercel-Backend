import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

// Debug: Log Cloudinary configuration
console.log('🔧 Cloudinary Configuration:');
console.log('CLOUD_NAME:', process.env.CLOUD_NAME ? 'Set' : 'NOT SET');
console.log('API_KEY:', process.env.API_KEY ? 'Set (length: ' + process.env.API_KEY.length + ')' : 'NOT SET');
console.log('API_SECRET:', process.env.API_SECRET ? 'Set (length: ' + process.env.API_SECRET.length + ')' : 'NOT SET');

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  secure: true,
});

// Test configuration
console.log('✅ Cloudinary configured successfully');


export const uploadBufferToCloudinary = (buffer, folder = "recruiter-logos") => {
  return new Promise((resolve, reject) => {
    // Create an upload stream
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error) {
          console.error("Cloudinary stream upload error:", error);
          return reject(error);
        }
        resolve({
          public_id: result.public_id,
          url: result.secure_url,
        });
      }
    );

    // Write the buffer to the stream and end it
    stream.end(buffer);
  });
};

export default cloudinary;