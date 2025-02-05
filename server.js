import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import pg from 'pg';
import Web3 from 'web3';
import axios from 'axios';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import winston from 'winston';
import Redis from 'ioredis';

const { Pool } = pg;
dotenv.config();
const app = express();
app.use(express.json());

const redisClient = new Redis();

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'server.log' })
    ]
});

const pinata_api = process.env.PINATA_API_KEY;
const pinata_secret = process.env.PINATA_API_SECRET;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

const web3 = new Web3('https://rpc-amoy.polygon.technology/');
const abi = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "p_id", "type": "uint256" },
            { "internalType": "bytes32", "name": "p_merkleRoot", "type": "bytes32" },
            { "internalType": "string", "name": "p_cid", "type": "string" }
        ],
        "name": "addData",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "uint256", "name": "p_id", "type": "uint256" },
            { "indexed": false, "internalType": "bytes32", "name": "p_merkleRoot", "type": "bytes32" },
            { "indexed": false, "internalType": "string", "name": "p_cid", "type": "string" }
        ],
        "name": "ProductAdded",
        "type": "event"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "name": "data",
        "outputs": [
            { "internalType": "uint256", "name": "product_id", "type": "uint256" },
            { "internalType": "bytes32", "name": "merkleRoot", "type": "bytes32" },
            { "internalType": "string", "name": "cid", "type": "string" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "pr_id", "type": "uint256" }],
        "name": "getData",
        "outputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" },
            { "internalType": "bytes32", "name": "", "type": "bytes32" },
            { "internalType": "string", "name": "", "type": "string" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    }
];


const contract_address = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(abi, contract_address);
const private_key = process.env.PRIVATE_KEY;
const wallet_address = process.env.WALLET_ADDRESS;

function hashWithSalt(value) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = keccak256(salt + value).toString('hex');
    return { salt, hash };
}

async function uploadToIPFS(data, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', data, {
                headers: {
                    pinata_api_key: pinata_api,
                    pinata_secret_api_key: pinata_secret,
                },
            });
            return response.data.IpfsHash;
        } catch (error) {
            logger.error(`Attempt ${i + 1} failed to upload to IPFS: ${error.message}`);
        }
    }
    throw new Error("Failed to upload data to IPFS");
}

async function sendTransaction(txnData) {
    try {
        const estimatedGas = Number(await contract.methods.addData(...Object.values(txnData)).estimateGas({ from: wallet_address }));
        const gasPrice = BigInt(await web3.eth.getGasPrice());

        const txnObject = {
            to: contract_address,
            gas: Math.floor(estimatedGas * 1.2),
            gasPrice: gasPrice.toString(),
            nonce: Number(await web3.eth.getTransactionCount(wallet_address)),
            data: contract.methods.addData(...Object.values(txnData)).encodeABI()
        };

        const signedTransaction = await web3.eth.accounts.signTransaction(txnObject, private_key);
        const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        return receipt;
    } catch (error) {
        logger.error(`Transaction failed: ${error.message}`);
        throw error;
    }
}

app.post('/add', async function (req, res) {
    try {
        const { product_id, product_name, product_mdate, product_batch } = req.body;
        logger.info("Calculating Merkle");

        const saltedHashes = [product_id, product_name, product_mdate, product_batch].map(hashWithSalt);
        const salts = saltedHashes.map(hash => hash.salt);
        const leaves = saltedHashes.map(hash => hash.hash);

        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const merkleroot = "0x" + tree.getRoot().toString("hex");

        const ipfsData = { product_id, product_name, product_mdate, product_batch };
        const ipfs_cid = await uploadToIPFS(ipfsData);
        logger.info("Data added to IPFS");

        const txnData = { product_id, merkleroot, ipfs_cid };
        const receipt = await sendTransaction(txnData);
        logger.info(`Transaction successful with hash: ${receipt.transactionHash}`);

        const insertQuery = `INSERT INTO product_verify (product_id, product_name, product_mdate, product_batch, salt1, salt2, salt3, salt4) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const insertValues = [product_id, product_name, product_mdate, product_batch, ...salts];
        await pool.query(insertQuery, insertValues);

        res.send("Data added");
        logger.info(`CID: ${ipfs_cid}, Merkle Root: ${merkleroot}`);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
        res.status(500).send("Error adding data");
    }
});


app.post('/verify', async function (req, res) {
    const { product_id } = req.body;
    try {
        logger.info("Verifying product...");
        const cacheKey = `product:${product_id}`;
        let cachedData = await redisClient.get(cacheKey);
        
        if (!cachedData) {
            logger.info("Cache miss. Fetching data from blockchain");
            const data = await contract.methods.data(product_id).call();

            if (!data || data.product_id == 0) {
                logger.warn("Product not found in blockchain");
                return res.status(404).json({ message: 'Product not found' });
            }
            
            cachedData = JSON.stringify({
                product_id: data.product_id.toString(),
                merkleRoot: data.merkleRoot,
                cid: data.cid
            });
            
            await redisClient.set(cacheKey, cachedData, 'EX', 3600);
        }
        
        const { merkleRoot: block_merkle, cid: p_cid } = JSON.parse(cachedData);
        const query = `SELECT * FROM product_verify WHERE product_id = $1`;
        const result = await pool.query(query, [product_id]);

        if (result.rows.length === 0) {
            logger.warn("Product not found in database");
            return res.status(404).json({ message: 'Product not found in database' });
        }
        
        const { salt1, salt2, salt3, salt4 } = result.rows[0];
        const url = `https://gateway.pinata.cloud/ipfs/${p_cid}`;
        const response = await axios.get(url);
        const jsonData = response.data;

        const leaves = [product_id, jsonData.product_name, jsonData.product_mdate, jsonData.product_batch]
            .map((value, index) => keccak256([salt1, salt2, salt3, salt4][index] + value).toString('hex'));

        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const verifyMerkleRoot = "0x" + tree.getRoot().toString("hex");

        logger.info(`Blockchain Merkle Root: ${block_merkle}, Calculated Merkle Root: ${verifyMerkleRoot}`);
        
        if (block_merkle === verifyMerkleRoot) {
            logger.info("Authentic Product");
            res.json({ message: "Authentic Product", block_merkle, verifyMerkleRoot });
        } else {
            logger.info("Tampered Product");
            res.json({ message: "Tampered Product" });
        }
    } catch (error) {
        logger.error(`Error: ${error.message}`);
        res.status(500).send("Error verifying data");
    }
});

app.listen(5000, function () {
    logger.info("Server is running on port 5000");
});
