require('dotenv').config();
const mongoose = require('mongoose');

async function updateSettings() {
  try {
    await mongoose.connect(process.env.MONGO_URI_TMP);
    console.log('✅ Connected to MongoDB');
    
    const result = await mongoose.connection.db.collection('apis').updateOne(
      { _id: new mongoose.Types.ObjectId("690abf4f8b607ccc400f2f42") },
      {
        $set: {
          "gameSettings.normal-spin": 85,
          "gameSettings.less-bet": 12,
          "gameSettings.less-bet-to": 0.5,
          "gameSettings.more-bet": 3,
          "gameSettings.more-bet-from": 0.8,
          "gameSettings.more-bet-to": 2,
          "gameSettings.freespin-less-bet": 2,
          "gameSettings.freespin-more-bet": 0.5,
          "gameSettings.freespin-more-bet-to": 15,
          "gameSettings.buy-feature-less-bet": 80,
          "gameSettings.buy-feature-less-bet-to": 20,
          "gameSettings.buy-feature-more-bet": 8,
          "gameSettings.buy-feature-more-bet-from": 20,
          "gameSettings.buy-feature-more-bet-to": 60
        }
      }
    );
    
    console.log('✅ Updated:', result.modifiedCount, 'document(s)');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

updateSettings();