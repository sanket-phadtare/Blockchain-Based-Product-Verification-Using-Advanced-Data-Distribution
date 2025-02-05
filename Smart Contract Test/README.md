# mverify Smart Contract Testing

## Overview
This test suite is designed to verify the functionality of the `mverify` smart contract using **Hardhat** and **Chai** assertions. The contract allows an owner to add and retrieve product data securely using **Merkle roots** and **IPFS CIDs**.

## Prerequisites
Ensure you have the following installed:
- **Node.js** (v14 or later recommended)
- **Hardhat** (`npm install --save-dev hardhat`)
- **Chai** for assertions (`npm install --save-dev chai`)

## Running the Tests
To execute the test suite, use the following command:
```sh
npx hardhat test
```

## Test Cases
### 1. Contract Deployment
- Verifies that the contract is deployed successfully.
- Ensures the contract owner is set correctly.

### 2. Only Owner Can Add Data
- **Validates that only the contract owner can add product data**.
- Attempts to add data from a non-owner account and expects a `Not authorized Entity` error.
- Adds product data successfully when called by the owner.
- Checks that the emitted `ProductAdded` event contains the correct values.

### 3. Duplicate Product ID Handling
- Ensures that adding the same `productId` twice **is not allowed**.
- Expects a `Product ID already exists` error when attempting a duplicate addition.

### 4. Retrieving Product Data
- Adds a product and verifies that it **retrieves correct data**.
- Compares the stored values against the expected values.

### 5. Handling Non-Existent Products
- Attempts to retrieve data for a non-existing `productId`.
- Ensures that it **fails with the correct error message** (`Product does not exist`).

## License
This project is licensed under the MIT License.


