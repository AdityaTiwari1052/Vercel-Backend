// models/user.model.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  clerkUserId: {
    type: String,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  profileImageUrl: {
    type: String,
    default: ''
  },
  resume: {
    type: String,
    default: ''
  },
  resumeName: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", UserSchema);
export default User;
