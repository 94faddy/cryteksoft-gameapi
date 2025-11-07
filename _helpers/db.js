const mongoose = require('mongoose');
mongoose.set("strictQuery", false);

// ✅ แก้: ใช้ mongoose.connect แทน createConnection เพื่อ connection pooling ที่ดีกว่า
const mongoOptions = {
    maxPoolSize: 10, // จำนวน connection สูงสุดใน pool
    minPoolSize: 2,  // จำนวน connection ขั้นต่ำใน pool
    serverSelectionTimeoutMS: 5000, // timeout 5 วินาที
    socketTimeoutMS: 45000, // socket timeout
    family: 4 // ใช้ IPv4
};

// ✅ ใช้ mongoose.connect แทนการสร้าง connection แยก
mongoose.connect(process.env.MONGO_URI_TMP, mongoOptions)
    .then(() => console.log('✅ MongoDB connected with pooling'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ เพิ่ม event listeners เพื่อ monitor connection
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});

// ✅ ใช้ default connection แทนการสร้างใหม่
const conn = mongoose.connection;

mongoose.Query.prototype.options = { allowDiskUse: true };

// โครงสร้างของ Game Settings ที่จะถูกใช้ใน ApiSchema และ UserSchema
const gameSettingSchemaStructure = {
    'normal-spin': { type: Number, default: 85 },
    'less-bet': { type: Number, default: 35 },
    'less-bet-from': { type: Number, default: 0 },
    'less-bet-to': { type: Number, default: 1 },
    'more-bet': { type: Number, default: 8 },
    'more-bet-from': { type: Number, default: 2 },
    'more-bet-to': { type: Number, default: 4 },
    'freespin-less-bet': { type: Number, default: 1 },
    'freespin-less-bet-from': { type: Number, default: 0 },
    'freespin-less-bet-to': { type: Number, default: 4 },
    'freespin-more-bet': { type: Number, default: 0 },
    'freespin-more-bet-from': { type: Number, default: 50 },
    'freespin-more-bet-to': { type: Number, default: 60 },
    'buy-feature-less-bet': { type: Number, default: 90 },
    'buy-feature-less-bet-from': { type: Number, default: 0 },
    'buy-feature-less-bet-to': { type: Number, default: 50 },
    'buy-feature-more-bet': { type: Number, default: 4 },
    'buy-feature-more-bet-from': { type: Number, default: 50 },
    'buy-feature-more-bet-to': { type: Number, default: 60 }
};

const apiSchema = new mongoose.Schema({
    name: { type: String , required: true },
    username: { type: String , required: true },
    password: { type: String , required: true },
    secret : { type: String, required: true },
    apikey: { type: String, unique: true, required: true },
    ip: { type: String, required: true },
    callback: { type: String, required: true },
    two_factor_secret: { type: String },
    two_factor_enabled: { type: Boolean, default: false },  
    gameSettings: { type: gameSettingSchemaStructure, default: () => ({}) }  
});

const Api = conn.model('Api', apiSchema);

const logSchema = new mongoose.Schema({
    id: { type: String , unique: true, required: true },
    productId : { type: String },
    username : { type: String},
    currency : { type: String  },
    gameId : { type: String  },
    mainId : { type: String  },
    secret_key : { type: String  },
    enc_data : { type: String  },
    operator_token : { type: String  },
    timestampMillis : { type: Number  },
    sessionToken : { type: String },
    txns : { type: Object, required: true },
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api'  },
    createdDate: { type: Date, default: Date.now }
});

// ✅ เพิ่ม index สำหรับการ query ที่ใช้บ่อย
logSchema.index({ createdDate: -1 });
logSchema.index({ apikey: 1, createdDate: -1 });

const Log = conn.model('Log', logSchema);

const TransactionSchema = new mongoose.Schema({
    id: { type: String , unique: true, required: true },
    statusCode : { type: Number, required: true, index: true },
    wallet_amount_before : { type: Number, required: true },
    wallet_amount_after : { type: Number, required: true},
    betAmount : { type: Number , required: true },
    payoutAmount : { type: Number , required: true },
    data : { type: Object },    
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api', index: true },
    createdDate: { type: Date, default: Date.now, index: true }
});

// ✅ เพิ่ม compound index ที่จำเป็น
TransactionSchema.index({ apikey: 1, statusCode: 1, createdDate: -1 });
TransactionSchema.index({ 'data.username': 1, createdDate: -1 }); // สำหรับ query history by username

const Transaction = conn.model('Transaction', TransactionSchema);

const TrandaySchema = new mongoose.Schema({
    betAmount : { type: Number , required: true },
    payoutAmount : { type: Number , required: true },  
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api'  },
    username: { type: String},
    data : { type: String } // วันที่ในรูปแบบ MM/DD/YYYY
});

// ✅ เพิ่ม compound index สำหรับ query ที่ใช้บ่อย
TrandaySchema.index({ apikey: 1, data: 1 }); // สำหรับ query by agent + date
TrandaySchema.index({ data: 1 }); // สำหรับ query by date

const Tranday = conn.model('Tranday', TrandaySchema);

// ✅ อัพเดท User Schema - เพิ่ม gameSettings และ useAgentSettings
const userSchema = new mongoose.Schema({
    userid: { type: String , required: true },
    username: { type: String , required: true },
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api'  },
    token: { type: String , required: true },
    data : { type: Object },    
    secret_key: { type: String },
    useAgentSettings: { type: Boolean, default: true }, // true = ใช้ของ Agent, false = ใช้ของตัวเอง
    gameSettings: { type: gameSettingSchemaStructure, default: () => ({}) } // Settings เฉพาะของ User
});

// ✅ เพิ่ม index สำหรับการ query ที่ใช้บ่อย
userSchema.index({ username: 1, apikey: 1 }); // สำหรับ findOne by username + apikey
userSchema.index({ token: 1 }); // สำหรับ findOne by token
userSchema.index({ userid: 1 }); // สำหรับ findOne by userid

const User = conn.model('User', userSchema);

const settingSchema = new mongoose.Schema({ 
    'name': { type: String , required: true },
    'normal-spin': { type: Number , required: true },
    'less-bet': { type: Number , required: true },
    'less-bet-from': { type: Number , required: true },
    'less-bet-to': { type: Number , required: true },
    'more-bet': { type: Number , required: true },
    'more-bet-from': { type: Number , required: true },
    'more-bet-to': { type: Number , required: true },
    'freespin-less-bet': { type: Number , required: true },
    'freespin-less-bet-from': { type: Number , required: true },
    'freespin-less-bet-to': { type: Number , required: true },
    'freespin-more-bet': { type: Number , required: true },
    'freespin-more-bet-from': { type: Number , required: true },
    'freespin-more-bet-to': { type: Number , required: true },
    'buy-feature-less-bet': { type: Number , required: true },
    'buy-feature-less-bet-from': { type: Number , required: true },
    'buy-feature-less-bet-to': { type: Number , required: true },
    'buy-feature-more-bet': { type: Number , required: true },
    'buy-feature-more-bet-from': { type: Number , required: true },
    'buy-feature-more-bet-to': { type: Number , required: true }
});

const Setting = conn.model('Setting', settingSchema);

module.exports = {
    Api,Transaction,User,Log,Setting,Tranday
};