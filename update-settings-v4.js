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
          "gameSettings.normal-spin": 55,
          "gameSettings.less-bet": 32,
          "gameSettings.less-bet-from": 0.2,
          "gameSettings.less-bet-to": 1.1,
          "gameSettings.more-bet": 13,
          "gameSettings.more-bet-from": 1.5,
          "gameSettings.more-bet-to": 3.5,
          "gameSettings.freespin-less-bet": 1.5,
          "gameSettings.freespin-less-bet-from": 1,
          "gameSettings.freespin-less-bet-to": 8,
          "gameSettings.freespin-more-bet": 0.5,
          "gameSettings.freespin-more-bet-from": 8,
          "gameSettings.freespin-more-bet-to": 20,
          "gameSettings.buy-feature-less-bet": 70,
          "gameSettings.buy-feature-less-bet-from": 5,
          "gameSettings.buy-feature-less-bet-to": 30,
          "gameSettings.buy-feature-more-bet": 15,
          "gameSettings.buy-feature-more-bet-from": 30,
          "gameSettings.buy-feature-more-bet-to": 80
        }
      }
    );
    
    console.log('✅ Updated:', result.modifiedCount, 'document(s)');
    console.log('\n📊 ค่า Settings ใหม่ (แก้ไขปัญหา):');
    console.log('🎯 Free Spin: 1 ครั้ง/50 รอบ (เดิม: 1/17 รอบ)');
    console.log('💰 ตัวคูณ Free Spin: 8-20x (เดิม: 15-50x)');
    console.log('📉 RTP: ~60% (เดิม: ~220%)');
    console.log('❌ โอกาสเสีย: ~60%');
    console.log('✅ โอกาสชนะ: ~40%\n');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

updateSettings();