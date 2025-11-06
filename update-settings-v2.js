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
          "gameSettings.normal-spin": 50,
          "gameSettings.less-bet": 35,
          "gameSettings.less-bet-from": 0,
          "gameSettings.less-bet-to": 1.2,
          "gameSettings.more-bet": 15,
          "gameSettings.more-bet-from": 1.5,
          "gameSettings.more-bet-to": 4,
          "gameSettings.freespin-less-bet": 3,
          "gameSettings.freespin-less-bet-from": 2,
          "gameSettings.freespin-less-bet-to": 10,
          "gameSettings.freespin-more-bet": 1,
          "gameSettings.freespin-more-bet-from": 10,
          "gameSettings.freespin-more-bet-to": 30,
          "gameSettings.buy-feature-less-bet": 65,
          "gameSettings.buy-feature-less-bet-from": 5,
          "gameSettings.buy-feature-less-bet-to": 40,
          "gameSettings.buy-feature-more-bet": 20,
          "gameSettings.buy-feature-more-bet-from": 40,
          "gameSettings.buy-feature-more-bet-to": 100
        }
      }
    );
    
    console.log('✅ Updated:', result.modifiedCount, 'document(s)');
    console.log('\n📊 ค่า Settings ใหม่:');
    console.log('- โอกาสชนะ: ~30%');
    console.log('- โอกาสเสีย: ~70%');
    console.log('- RTP: ~70-75% (บ้านได้ 25-30%)');
    console.log('- Free Spin: 1 ครั้ง/25 รอบ\n');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

updateSettings();