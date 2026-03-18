import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config(); // ✅ Load environment variables

// ✅ Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Function to send SMS
export const sendSMS = async (to, message) => {
  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio number
      to,
    });
    console.log("OTP sent successfully to:", to);
  } catch (error) {
    console.error("SMS Sending Error:", error);
    throw new Error("Failed to send OTP. Try again later.");
  }
};
