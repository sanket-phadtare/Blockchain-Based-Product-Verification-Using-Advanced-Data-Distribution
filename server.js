import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import pg from 'pg';
import Web3 from 'web3';
import axios from 'axios';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

const { Pool } = pg;
dotenv.config();
const app = express();
app.use(express.json());

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
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "uint256", "name": "p_id", "type": "uint256" },
            { "indexed": false, "internalType": "string", "name": "p_merkleRoot", "type": "string" },
            { "indexed": false, "internalType": "string", "name": "p_cid", "type": "string" }
        ], "name": "ProductAdded", "type": "event"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "p_id", "type": "uint256" },
            { "internalType": "string", "name": "p_merkleRoot", "type": "string" },
            { "internalType": "string", "name": "p_cid", "type": "string" }
        ], "name": "addData", "outputs": [], "stateMutability": "nonpayable", "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "", "type": "uint256" }
        ],
        "name": "data", "outputs": [
            { "internalType": "uint256", "name": "product_id", "type": "uint256" },
            { "internalType": "string", "name": "merkleRoot", "type": "string" },
            { "internalType": "string", "name": "cid", "type": "string" }
        ], "stateMutability": "view", "type": "function"
    }
];

const contract_address = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(abi, contract_address);
const private_key = process.env.PRIVATE_KEY;
const wallet_address = process.env.WALLET_ADDRESS;

// Salted hashing function
function hashWithSalt(value) {
    const salt = crypto.randomBytes(16).toString('hex'); // Generate random salt
    const hash = keccak256(salt + value).toString('hex'); // Combine salt and value, then hash
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
            console.log(`Attempt ${i + 1} failed:`, error.message);
        }
    }
    throw new Error("Failed to upload data to IPFS");
}

app.post('/add', async function (req, res) {
    try {
        const { product_id, product_name, product_mdate, product_batch } = req.body;
        console.log("Calculating Merkle");

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
        const merkleroot = tree.getRoot().toString('hex');

        const ipfsData = {
            product_id,
            product_name,
            product_mdate,
            product_batch
        };
        const ipfs_cid = await uploadToIPFS(ipfsData);

        
        console.log("Data added to IPFS");

        console.log("Connecting with Blockchain");
        const txnData = contract.methods.addData(product_id, merkleroot, ipfs_cid).encodeABI();
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(wallet_address);
        const txnObject = {
            to: contract_address,
            gas: 8000000,
            gasPrice: gasPrice,
            nonce: nonce,
            data: txnData
        };

        console.log("Transaction Under Process...")
        const signedTransaction = await web3.eth.accounts.signTransaction(txnObject, private_key);
        await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);

        const insertQuery = `INSERT INTO product_verify (product_id, product_name, product_mdate, product_batch, salt1, salt2, salt3, salt4) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const insertValues = [product_id, product_name, product_mdate, product_batch, salt1, salt2, salt3, salt4];
        await pool.query(insertQuery, insertValues);

        res.send("Data added");
        console.log('CID:', ipfs_cid);
        console.log('Merkle Root:', merkleroot);
        console.log("Transaction Successfull");

    } catch (error) {
        console.log("Error", error);
        res.status(500).send("Error adding data");
    }
});


app.post('/verify', async function (req, res) {
    const { product_id } = req.body;

    try {
        console.log("Please wait while we verify");
        const data = await contract.methods.data(product_id).call();
        if (!data) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const block_merkle = data.merkleRoot;
        const p_cid = data.cid;

        const query = `SELECT * FROM product_verify WHERE product_id = $1`;
        const result = await pool.query(query, [product_id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Product not found in database' });
        }

        const { salt1, salt2, salt3, salt4 } = result.rows[0];

        const url = `https://gateway.pinata.cloud/ipfs/${p_cid}`;
        const response = await axios.get(url);
        const jsonData = response.data;

        const leaf1 = keccak256(salt1 + product_id).toString('hex');
        const leaf2 = keccak256(salt2 + jsonData.product_name).toString('hex');
        const leaf3 = keccak256(salt3 + jsonData.product_mdate).toString('hex');
        const leaf4 = keccak256(salt4 + jsonData.product_batch).toString('hex');

        const leaves = [leaf1, leaf2, leaf3, leaf4];
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const verifyMerkleRoot = tree.getRoot().toString('hex');

        console.log("Blockchain Merkle Root:", block_merkle);
        console.log("Calculated Merkle Root:", verifyMerkleRoot);

        if (block_merkle === verifyMerkleRoot) {
            console.log("Authentic Product");
            res.json({ message: "Authentic Product" });
        } else {
            console.log("Tampered Product");
            res.json({ message: "Tampered Product" });
        }
    } catch (error) {
        console.log("Error: ", error);
        res.status(500).send("Error verifying data");
    }
});

app.listen(5000, function () {
    console.log("Server is running on port 5000");
});
