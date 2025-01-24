import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import pg from 'pg';
import axios from 'axios';
import Web3 from 'web3';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

const {Pool} = pg;
dotenv.config();
const app=express();
app.use(express.json());

const pinata_api = process.env.PINATA_API_KEY;
const pinata_secret = process.env.PINATA_API_SECRET;

const pool = new Pool
({
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
			{"indexed": true, "internalType": "uint256", "name": "p_id", "type": "uint256"},
			{"indexed": false, "internalType": "string", "name": "p_merkleRoot", "type": "string"},
			{"indexed": false, "internalType": "string", "name": "p_cid", "type": "string"}
		],   "name": "ProductAdded", "type": "event"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "p_id", "type": "uint256"},
			{"internalType": "string", "name": "p_merkleRoot", "type": "string"},
			{"internalType": "string", "name": "p_cid", "type": "string"}
		],   "name": "addData", "outputs": [], "stateMutability": "nonpayable", "type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "", "type": "uint256"}
		],
		"name": "data","outputs": [
			{"internalType": "uint256", "name": "product_id", "type": "uint256"},
			{"internalType": "string", "name": "merkleRoot", "type": "string"},
			{"internalType": "string", "name": "cid", "type": "string"}
		],"stateMutability": "view", "type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "pr_id", "type": "uint256"}
		],   "name": "getData", "outputs": [
			{"internalType": "uint256", "name": "", "type": "uint256"},
			{"internalType": "string", "name": "", "type": "string"},
			{"internalType": "string", "name": "","type": "string"}
		],   "stateMutability": "view", "type": "function"}
];

const contract_address = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(abi, contract_address);
const private_key = process.env.PRIVATE_KEY;
const wallet_address = process.env.WALLET_ADDRESS;

app.post('/add', async function(req,res)
{
    
    try
    {
        const {product_id, product_name, product_mdate, product_batch} = req.body;
    
        const leaf1 = keccak256(product_id);
        const leaf2 = keccak256(product_name);
        const leaf3 = keccak256(product_mdate);
        const leaf4 = keccak256(product_batch);

        // Construct the Merkle tree
        const leaves = [leaf1, leaf2, leaf3, leaf4];
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

        // Generate the Merkle Root
        const merkleroot = tree.getRoot().toString('hex');
       

        const ipfsData =
        {
            product_id,
            product_name,
            product_mdate,
            product_batch
        };
        const result = JSON.stringify(ipfsData);
        const response = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', ipfsData, {
            headers: {
                pinata_api_key: pinata_api,
                pinata_secret_api_key: pinata_secret,
            },
        });

        const ipfs_cid = response.data.IpfsHash;

        console.log("Transaction under process");

        const txnData = contract.methods.addData(product_id , merkleroot, ipfs_cid).encodeABI();
        const gasPrice = await web3.eth.getGasPrice();
        const nonce = await web3.eth.getTransactionCount(wallet_address);
        const txnObject = 
        {
            to: contract_address,
            gas: 8000000,
            gasPrice: gasPrice,
            nonce: nonce,
            data: txnData
        };

        const signedTransaction = await web3.eth.accounts.signTransaction(txnObject, private_key);
        const sendTransaction = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);

        const insertQuery = `INSERT INTO product_verify (product_id, product_name, product_mdate, product_batch) VALUES ($1, $2, $3, $4)`;
        const insertValues = [product_id, product_name, product_mdate, product_batch];
        await pool.query(insertQuery, insertValues);

        res.send("Data added");
        console.log('JSON successfully uploaded to Pinata!');
        console.log('CID:', response.data.IpfsHash);
        console.log("Merkle Root:", merkleroot);
        console.log("Transaction Successfull");

        
        
    }
    catch(error)
    {
        console.log("Error",error);
    }


});



app.post('/verify', async function(req,res)
{
    const {product_id} = req.body;
    
    try
    {
        const data = await contract.methods.getData(product_id).call();
        
        if (!data || data.length === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }

		
       	const block_merkle = data[1]; //Merkle Root Retreived from Blockchain
       	const p_cid = data[2];

       	const url = `https://gateway.pinata.cloud/ipfs/${p_cid}`;

        const response = await axios.get(url);
        const jsonData = response.data; // Data Retreived from Pinata for Recalculation the Merkle Proof and generating merkle root.

		const leaf1 = keccak256(product_id);
        const leaf2 = keccak256(jsonData.product_name);
        const leaf3 = keccak256(jsonData.product_mdate);
        const leaf4 = keccak256(jsonData.product_batch);

        const leaves = [leaf1, leaf2, leaf3, leaf4];
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

        // Verify the Merkle Root with the block Merkle Root
        const verifyMerkleRoot = tree.getRoot().toString('hex');
        console.log("Blockchain Merkle Root:", block_merkle);
        console.log("Calculated Merkle Root:", verifyMerkleRoot);

        if (block_merkle === verifyMerkleRoot) {
            console.log("Authentic Product");
        } else {
            console.log("Tampered Product");
        }
		
       
       res.json("Data fetched and verified");
        

    }
    catch(error)
    {
        console.log("Error: ",error);
    }

});


app.listen(5000);