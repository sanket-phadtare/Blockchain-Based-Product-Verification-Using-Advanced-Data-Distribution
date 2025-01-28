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
const abi =[
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
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
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
        "inputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
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
        "inputs": [
            { "internalType": "uint256", "name": "pr_id", "type": "uint256" }
        ],
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
        "outputs": [
            { "internalType": "address", "name": "", "type": "address" }
        ],
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

app.post('/add', async function (req, res) {
    try {
        const { product_id, product_name, product_mdate, product_batch } = req.body;
        logger.info("Calculating Merkle");

        const saltedHash1 = hashWithSalt(product_id);
        const saltedHash2 = hashWithSalt(product_name);
        const saltedHash3 = hashWithSalt(product_mdate);
        const saltedHash4 = hashWithSalt(product_batch);

        const salt1 = saltedHash1.salt;
        const salt2 = saltedHash2.salt;
        const salt3 = saltedHash3.salt;
        const salt4 = saltedHash4.salt;

        const leaf1 = saltedHash1.hash;
        const leaf2 = saltedHash2.hash;
        const leaf3 = saltedHash3.hash;
        const leaf4 = saltedHash4.hash;

        const leaves = [leaf1, leaf2, leaf3, leaf4];
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const mr = tree.getRoot(); 
        const merkleroot = "0x" + mr.toString("hex"); 

        const ipfsData = {
            product_id,
            product_name,
            product_mdate,
            product_batch
        };
        const ipfs_cid = await uploadToIPFS(ipfsData);

        logger.info("Data added to IPFS");

        logger.info("Connecting with Blockchain");
        const txnData = contract.methods.addData(product_id, merkleroot, ipfs_cid).encodeABI();
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(wallet_address);
        const txnObject = {
            to: contract_address,
            gas: 4000000,
            gasPrice: gasPrice,
            nonce: nonce,
            data: txnData
        };

        logger.info("Transaction Under Process...");
        const signedTransaction = await web3.eth.accounts.signTransaction(txnObject, private_key);
        await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);

        const insertQuery = `INSERT INTO product_verify (product_id, product_name, product_mdate, product_batch, salt1, salt2, salt3, salt4) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const insertValues = [product_id, product_name, product_mdate, product_batch, salt1, salt2, salt3, salt4];
        await pool.query(insertQuery, insertValues);

        res.send("Data added");
        logger.info(`CID: ${ipfs_cid}`);
        logger.info(`Merkle Root: ${merkleroot}`);
        logger.info("Transaction Successful");

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

        if (cachedData) {
            logger.info("Cache hit for product data");
            cachedData = JSON.parse(cachedData);
        } else {
            logger.info("Cache miss. Fetching data from blockchain");
            const data = await contract.methods.data(product_id).call();

            if (!data) {
                logger.warn("Product not found in blockchain");
                return res.status(404).json({ message: 'Product not found' });
            }

            cachedData = JSON.parse(JSON.stringify(data, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value
            ));

            // Check if product exists in the database before caching the data
            const query = `SELECT * FROM product_verify WHERE product_id = $1`;
            const result = await pool.query(query, [product_id]);

            if (result.rows.length === 0) {
                logger.warn("Product not found in database");
                return res.status(404).json({ message: 'Product not found in database' });
            }

            // Cache the valid data only if the product exists in both blockchain and database
            await redisClient.set(cacheKey, JSON.stringify(cachedData), 'EX', 3600); 
        }

        const block_merkle = cachedData.merkleRoot;
        const p_cid = cachedData.cid;

        // Query the database to fetch product verification salts
        const query = `SELECT * FROM product_verify WHERE product_id = $1`;
        const result = await pool.query(query, [product_id]);

        if (result.rows.length === 0) {
            logger.warn("Product not found in database");
            return res.status(404).json({ message: 'Product not found in database' });
        }

        const { salt1, salt2, salt3, salt4 } = result.rows[0];

        // Fetch the product data from IPFS using Pinata
        const url = `https://gateway.pinata.cloud/ipfs/${p_cid}`;
        const response = await axios.get(url);
        const jsonData = response.data;

        // Generate Merkle leaves based on salts and product data
        const leaf1 = keccak256(salt1 + product_id).toString('hex');
        const leaf2 = keccak256(salt2 + jsonData.product_name).toString('hex');
        const leaf3 = keccak256(salt3 + jsonData.product_mdate).toString('hex');
        const leaf4 = keccak256(salt4 + jsonData.product_batch).toString('hex');

        const leaves = [leaf1, leaf2, leaf3, leaf4];
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const vmr = tree.getRoot(); // Merkle root as a Buffer
        const verifyMerkleRoot = "0x" + vmr.toString("hex");

        logger.info(`Blockchain Merkle Root: ${block_merkle.toString()}`);
        logger.info(`Calculated Merkle Root: ${verifyMerkleRoot}`);

        // Verify if the Merkle root matches
        if (block_merkle === verifyMerkleRoot) {
            logger.info("Authentic Product");
            res.json({
                message: "Authentic Product",
                block_merkle,
                verifyMerkleRoot
            });
        } else {
            logger.info("Tampered Product");
            res.json({ message: "Tampered Product" });
        }
    } catch (error) {
        logger.error(`Error: ${error.message}`);
        res.status(500).send("Error verifying data");
    }
});


app.use((err, req, res, next) => {
    logger.error(`Error: ${err.message}`);
    res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(5000, function () {
    logger.info("Server is running on port 5000");
});
