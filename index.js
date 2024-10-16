require('dotenv').config();
const { subscribeRaydium } = require('./newRaydiumLpListener');
const { connectToDatabase } = require('./newRaydiumLpService');

(async () => {
    await connectToDatabase();
    subscribeRaydium().catch(console.error);
})();