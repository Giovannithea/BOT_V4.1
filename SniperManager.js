const Sniper = require('./Sniper');
require('dotenv').config(); // Load environment variables
const newRaydiumLpService = require('./newRaydiumLpService'); // Import the service for mapping token data

class SniperManager {
    constructor() {
        this.snipers = [];
    }

    async addSniper(config) {
        try {
            // Use the base token from .env
            const baseToken = process.env.BASE_TOKEN;

            if (!baseToken) {
                console.error('BASE_TOKEN not set in .env');
                return;
            }

            // Fetch the necessary accounts for the target token (coinMint) using newRaydiumLpService
            const { targetToken, buyAmount, sellTargetPrice } = config;

            // Use newRaydiumLpService to get required accounts
            const userCoinVault = await newRaydiumLpService.getUserCoinVault(targetToken);
            const userPcVault = await newRaydiumLpService.getUserPcVault(targetToken);

            if (!userCoinVault || !userPcVault) {
                console.error('Failed to fetch necessary vaults for token:', targetToken);
                return;
            }

            // Build sniper configuration using baseToken from .env and coinMint as target token
            const sniperConfig = {
                ...config,
                baseToken, // Use baseToken from .env
                userCoinVault, // Vault for the target token (coinMint)
                userPcVault    // Vault for the paired currency
            };

            const sniper = new Sniper(sniperConfig);
            this.snipers.push(sniper);
            console.log('Sniper added with config:', sniperConfig);

            // Perform the buy operation using the base token and target token (coinMint)
            sniper.buyToken().then(() => {
                console.log(`Token ${targetToken} bought with ${baseToken}. Now watching for sell target price: ${sellTargetPrice}`);
                sniper.watchPrice().catch(err => {
                    console.error('Error watching price:', err);
                });
            }).catch(err => {
                console.error('Error buying token:', err);
            });

        } catch (error) {
            console.error("Error adding sniper:", error.message);
        }
    }

    setBuyAmount(index, amount) {
        if (this.snipers[index]) {
            this.snipers[index].setBuyAmount(amount);
            console.log(`Buy amount set to ${amount} for sniper at index ${index}`);
        } else {
            console.error('Sniper not found at index:', index);
        }
    }

    setSellTargetPrice(index, price) {
        if (this.snipers[index]) {
            this.snipers[index].setSellTargetPrice(price);
            console.log(`Sell target price set to ${price} for sniper at index ${index}`);
        } else {
            console.error('Sniper not found at index:', index);
        }
    }

    async init() {
        console.log('Sniper Manager initialized');
    }
}

module.exports = new SniperManager();
