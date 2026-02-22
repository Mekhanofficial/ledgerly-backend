const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

dotenv.config();

const args = process.argv.slice(2);
const emailArg = args.find((arg) => arg.startsWith('--email='));
const passwordArg = args.find((arg) => arg.startsWith('--password='));

const email = emailArg ? emailArg.split('=')[1] : null;
const password = passwordArg ? passwordArg.split('=')[1] : null;

const run = async () => {
  if (!email || !password) {
    console.error('Usage: node scripts/resetUserPassword.js --email=user@example.com --password=NewPass123');
    process.exit(1);
  }

  await connectDB();

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      console.error(`User not found for email: ${normalizedEmail}`);
      process.exit(1);
    }

    user.password = password;
    await user.save();

    console.log(`Password updated for ${normalizedEmail}`);
  } catch (error) {
    console.error('Failed to reset password:', error?.message || error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
};

run();
