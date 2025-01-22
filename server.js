import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import pg from 'pg';
import axios from 'axios';
import Web3 from 'web3';

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
			{"indexed": false, "internalType": "bytes32", "name": "p_merkleRoot", "type": "bytes32"},
			{"indexed": false, "internalType": "string", "name": "p_cid", "type": "string"}
		],
		"name": "ProductAdded",
		"type": "event"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "p_id", "type": "uint256"},
			{"internalType": "bytes32", "name": "p_merkleRoot", "type": "bytes32"},
			{"internalType": "string", "name": "p_cid", "type": "string"}
		],
		"name": "addData",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "", "type": "uint256"}
		],
		"name": "data",
		"outputs": [
			{"internalType": "uint256", "name": "product_id", "type": "uint256"},
			{"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"},
			{"internalType": "string", "name": "cid", "type": "string"}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "pr_id", "type": "uint256"}
		],
		"name": "getData",
		"outputs": [
			{"internalType": "uint256", "name": "", "type": "uint256"},
			{"internalType": "bytes32", "name": "", "type": "bytes32"},
			{"internalType": "string", "name": "", "type": "string"}
		],
		"stateMutability": "view",
		"type": "function"
	}
];

const contract_address = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(abi, contract_address);
const private_key = process.env.PRIVATE_KEY;
const wallet_address = process.env.WALLET_ADDRESS;

app.post('/', async function(req,res)
{
    
   
    

    try
    {
        const {product_id, product_name, product_mdate, product_batch} = req.body;
    
        const hash1 = crypto.createHash('sha256').update(product_id).digest('hex');
        const hash2 = crypto.createHash('sha256').update(product_name).digest('hex');
        const hash3 = crypto.createHash('sha256').update(product_mdate).digest('hex');
        const hash4 = crypto.createHash('sha256').update(product_batch).digest('hex');

        const hash12 = crypto.createHash('sha256').update(hash1+hash2).digest('hex');
        const hash34 = crypto.createHash('sha256').update(hash3+hash4).digest('hex');

        const merkleroot = crypto.createHash('sha256').update(hash12+hash34).digest('hex');
        const merklerootBytes32 = Buffer.from(merkleroot, 'hex');

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

        const txnData = contract.methods.addData(product_id , merklerootBytes32, ipfs_cid).encodeABI();
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

        const insertQuery = `INSERT INTO product_verify (product_id, ipfs_cid, merkle_root) VALUES ($1, $2, $3)`;
        const insertValues = [product_id, ipfs_cid, merkleroot];
        await pool.query(insertQuery, insertValues);

        res.send("Data added");
        console.log('JSON successfully uploaded to Pinata!');
        console.log('CID:', response.data.IpfsHash);
        console.log("Transaction Successfull");

        
        
    }
    catch(error)
    {
        console.log("Error",error);
    }


});


app.listen(5000);