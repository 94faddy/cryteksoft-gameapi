const mongoose = require('mongoose');
mongoose.set("strictQuery", false);
const conn = mongoose.createConnection(process.env.MONGO_URI_TMP);

mongoose.Query.prototype.options = { allowDiskUse: true };

// โครงสร้างของ Game Settings ที่จะถูกใช้ใน ApiSchema
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
// END: โค้ดที่เพิ่มเข้ามา

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
   // callback: { type: String, required: true }
});

const Log = conn.model('Log', logSchema);

const TransactionSchema = new mongoose.Schema({
    id: { type: String , unique: true, required: true },
    statusCode : { type: Number, required: true, index: true }, // เพิ่ม index
    wallet_amount_before : { type: Number, required: true },
    wallet_amount_after : { type: Number, required: true},
    betAmount : { type: Number , required: true },
    payoutAmount : { type: Number , required: true },
    data : { type: Object },    
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api', index: true }, // เพิ่ม index
    createdDate: { type: Date, default: Date.now, index: true } // เพิ่ม index
   // callback: { type: String, required: true }
});

// สร้าง Compound Index เพื่อประสิทธิภาพสูงสุดในการค้นหาและเรียงลำดับพร้อมกัน
TransactionSchema.index({ apikey: 1, statusCode: 1, createdDate: -1 });

const Transaction = conn.model('Transaction', TransactionSchema);

const TrandaySchema = new mongoose.Schema({
    betAmount : { type: Number , required: true },
    payoutAmount : { type: Number , required: true },  
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api'  },
    username: { type: String},
    data : { type: String }
   // callback: { type: String, required: true }
});

const Tranday = conn.model('Tranday', TrandaySchema);

const userSchema = new mongoose.Schema({
    userid: { type: String , required: true },
    username: { type: String , required: true },
    apikey: { type: mongoose.Schema.Types.ObjectId, ref: 'Api'  },
    token: { type: String , required: true },
    data : { type: Object },    
    secret_key: { type: String  }
});

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