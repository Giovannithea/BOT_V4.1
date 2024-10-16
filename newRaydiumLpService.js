require('dotenv').config();
const { MongoClient } = require('mongodb');
const bs58 = require('bs58');
const { PublicKey, Connection } = require('@solana/web3.js');
const borsh = require('borsh');

// MongoDB connection setup
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(MONGO_URI);
let db;

async function connectToDatabase() {
    try {
        await client.connect();
        db = client.db('Test1');  // Access the database 'Test1'
        console.log("Connected to MongoDB.");
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
    }
}

// Classes for Instructions
class AddLiquidityInstruction {
    constructor(fields) {
        this.instruction = fields.instruction;
        this.baseAmountIn = fields.baseAmountIn;
        this.quoteAmountIn = fields.quoteAmountIn;
        this.fixedSide = fields.fixedSide;
    }
}

class RemoveLiquidityInstruction {
    constructor(fields) {
        this.instruction = fields.instruction;
        this.amountIn = fields.amountIn;
    }
}

// Schema for Add Liquidity
const addLiquiditySchema = new Map([
    [
        AddLiquidityInstruction,
        {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['baseAmountIn', 'u64'],
                ['quoteAmountIn', 'u64'],
                ['fixedSide', 'u8'],
            ]
        }
    ]
]);

// Schema for Remove Liquidity
const removeLiquiditySchema = new Map([
    [
        RemoveLiquidityInstruction,
        {
            kind: 'struct',
            fields: [
                ['instruction', 'u8'],
                ['amountIn', 'u64'],
            ]
        }
    ]
]);

// Function to convert little-endian hex to decimal
function hexToDecimal(hex) {
    const buffer = Buffer.from(hex, 'hex');
    const decimal = buffer.readUIntLE(0, buffer.length);
    return decimal;
}

// Decoding function for Add Liquidity
function decodeAddLiquidityInstruction(data) {
    const buffer = Buffer.from(bs58.decode(data));
    const decoded = borsh.deserialize(addLiquiditySchema, AddLiquidityInstruction, buffer);

    console.log("Decoded Add Liquidity Instruction:");
    console.log(`Instruction: ${decoded.instruction}`);
    console.log(`Base Amount In: ${hexToDecimal(decoded.baseAmountIn.toString('hex'))}`);
    console.log(`Quote Amount In: ${hexToDecimal(decoded.quoteAmountIn.toString('hex'))}`);
    console.log(`Fixed Side: ${decoded.fixedSide === 0 ? 'Base' : 'Quote'}`);

    return decoded;
}

// Decoding function for Remove Liquidity
function decodeRemoveLiquidityInstruction(data) {
    const buffer = Buffer.from(bs58.decode(data));
    const decoded = borsh.deserialize(removeLiquiditySchema, RemoveLiquidityInstruction, buffer);

    console.log("Decoded Remove Liquidity Instruction:");
    console.log(`Instruction: ${decoded.instruction}`);
    console.log(`Amount In: ${hexToDecimal(decoded.amountIn.toString('hex'))}`);

    return decoded;
}

// Decode instruction data based on Raydium instruction types
function decodeInstructionData(data) {
    // Example logic to differentiate between different types of instructions
    if (data.includes('someAddLiquidityIdentifier')) {
        return decodeAddLiquidityInstruction(data);
    } else if (data.includes('someRemoveLiquidityIdentifier')) {
        return decodeRemoveLiquidityInstruction(data);
    }

    return null; // Or return appropriate decoded instruction object
}

// Process and store the transaction
async function processRaydiumLpTransaction(connection, signature) {
    try {
        const transactionDetails = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (transactionDetails) {
            const message = transactionDetails.transaction.message;
            const accounts = message.staticAccountKeys.map(key => key.toString());

            console.log("Transaction Message:", message);
            console.log("Accounts:", accounts);

            // Iterate through each instruction in the transaction
            if (Array.isArray(message.instructions)) {
                for (const ix of message.instructions) {
                    const programId = message.staticAccountKeys[ix.programIdIndex].toString();

                    // Check if the instruction is from the Raydium AMM program
                    if (programId === process.env.RAYDIUM_AMM_PROGRAM_ID) {
                        // Decode the instruction data to see if it matches the LP creation instructions
                        const decodedInstruction = decodeInstructionData(ix.data);

                        if (decodedInstruction && (decodedInstruction.instruction === 'CreatePool' || decodedInstruction.instruction === 'InitializeInstruction2')) {
                            console.log("CreatePool instruction found!");

                            // Use the account indexes specified in the instruction to get the LP-related accounts
                            const tokenData = {
                                programId: programId,
                                ammId: message.staticAccountKeys[ix.accounts[0]].toString(),
                                ammAuthority: message.staticAccountKeys[ix.accounts[1]].toString(),
                                ammOpenOrders: message.staticAccountKeys[ix.accounts[2]].toString(),
                                coinVault: message.staticAccountKeys[ix.accounts[3]].toString(),
                                pcVault: message.staticAccountKeys[ix.accounts[4]].toString(),
                                lpMint: message.staticAccountKeys[ix.accounts[5]].toString(),
                                coinMint: message.staticAccountKeys[ix.accounts[6]].toString(),
                                pcMint: message.staticAccountKeys[ix.accounts[7]].toString(),
                                ammTargetOrders: message.staticAccountKeys[ix.accounts[8]].toString(),
                                serumMarket: message.staticAccountKeys[ix.accounts[11]].toString(),
                                serumProgram: process.env.SERUM_PROGRAM_ID,
                                deployer: message.staticAccountKeys[message.staticAccountKeys.length - 1].toString() // Last account as deployer
                            };

                            console.log("Token Data:", tokenData);

                            // Retrieve liquidity amount (based on coinMint balance, can be omitted if not relevant)
                            const liquidityAmount = await connection.getBalance(new PublicKey(tokenData.coinMint)) / 1e9;
                            console.log(`Liquidity Pool Amount (In SOL): ${liquidityAmount}`);

                            // Store the event details in MongoDB
                            const eventDetails = {
                                signature,
                                instructionType: decodedInstruction.instruction,
                                timestamp: new Date(),
                                decodedInstruction,
                                liquidityAmount, // Include liquidity amount for reference
                                ...tokenData // Add token data to event details
                            };

                            console.log("Event Details:", eventDetails);

                            await db.collection('Test1').insertOne(eventDetails);  // Insert event details into MongoDB
                            console.log("Event inserted into MongoDB");

                            return tokenData; // Return the LP token data for further processing if needed
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error fetching/processing transaction:", error.message);
    }

    return null;
}

module.exports = {
    connectToDatabase,
    processRaydiumLpTransaction
};
