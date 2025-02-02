
# Blockchain-based Product Verification System

## Project Description
This project is a blockchain-based data verification system that integrates IPFS for storing product data, PostgreSQL for database management, Redis for caching, and utilizes a smart contract on the Polygon blockchain to ensure product authenticity. It leverages Merkle Trees for data integrity verification and Pinata for uploading product data to IPFS. 

The system provides an API to add product details and verify their authenticity based on the Merkle root stored in the blockchain and IPFS.

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/blockchain-product-verification.git
   cd blockchain-product-verification
   ```

2. **Install dependencies:**
   Install the required Node.js packages:
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root of the project and define the following variables:
   ```env
   DB_USER=<your_db_user>
   DB_HOST=<your_db_host>
   DB_NAME=<your_db_name>
   DB_PASSWORD=<your_db_password>
   DB_PORT=<your_db_port>
   
   PINATA_API_KEY=<your_pinata_api_key>
   PINATA_API_SECRET=<your_pinata_api_secret>
   
   CONTRACT_ADDRESS=<your_contract_address>
   PRIVATE_KEY=<your_private_key>
   WALLET_ADDRESS=<your_wallet_address>
   ```

4. **Set up PostgreSQL:**
   Ensure you have a PostgreSQL database running. Create the following table in your database:
   ```sql
   CREATE TABLE product_verify (
       product_id INT PRIMARY KEY,
       product_name VARCHAR(255),
       product_mdate DATE,
       product_batch VARCHAR(255),
       salt1 TEXT,
       salt2 TEXT,
       salt3 TEXT,
       salt4 TEXT
   );
   ```

5. **Set up Redis:**
   Ensure you have Redis running locally or in the cloud. The system will use Redis for caching product verification data.

6. **Run the server:**
   ```bash
   npm start
   ```

   This will start the server on `http://localhost:5000`.

## Environment Variables

| Variable              | Description                                        |
|-----------------------|----------------------------------------------------|
| `DB_USER`             | PostgreSQL database user                           |
| `DB_HOST`             | PostgreSQL database host                           |
| `DB_NAME`             | PostgreSQL database name                           |
| `DB_PASSWORD`         | PostgreSQL database password                       |
| `DB_PORT`             | PostgreSQL database port                           |
| `PINATA_API_KEY`      | Pinata API key for uploading files to IPFS         |
| `PINATA_API_SECRET`   | Pinata API secret for authentication              |
| `CONTRACT_ADDRESS`    | The address of the deployed smart contract on Polygon|
| `PRIVATE_KEY`         | The private key for signing blockchain transactions|
| `WALLET_ADDRESS`      | The wallet address to interact with the contract   |

## API Endpoints

### POST `/add`
Adds a new product to the blockchain, IPFS, and PostgreSQL database.

**Request Body:**
```json
{
  "product_id": 123,
  "product_name": "Product Name",
  "product_mdate": "2022-01-01",
  "product_batch": "Batch 001"
}
```

**Response:**
```json
{
  "message": "Data added"
}
```

### POST `/verify`
Verifies the authenticity of a product based on its ID by comparing the Merkle root from the blockchain and calculated Merkle root.

**Request Body:**
```json
{
  "product_id": 123
}
```

**Response (Authentic Product):**
```json
{
  "message": "Authentic Product",
  "block_merkle": "0x1234...",
  "verifyMerkleRoot": "0x1234..."
}
```

**Response (Tampered Product):**
```json
{
  "message": "Tampered Product"
}
```

## Deployment Steps

1. **Deploy Smart Contract:**
   Deploy the smart contract to the Polygon network using tools like Truffle or Hardhat.

2. **Set up environment variables:**
   As described in the **Setup Instructions**, ensure the environment variables are configured with your contract's address and other credentials.

3. **Deploy the backend:**
   You can deploy the backend to any cloud service like AWS, Heroku, or DigitalOcean.

4. **Set up database and Redis on the cloud:**
   If you're deploying to the cloud, make sure PostgreSQL and Redis are also deployed, and the connection settings are correctly configured in the `.env` file.

5. **Monitor and maintain:**
   Once deployed, monitor the system using tools like PM2 for process management and logging solutions for performance and error tracking.

