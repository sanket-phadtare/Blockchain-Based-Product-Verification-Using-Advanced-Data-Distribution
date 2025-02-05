const { expect } = require("chai");
const { ethers } = require("hardhat");
const { keccak256, toUtf8Bytes } = ethers; // ✅ Correct way to import hashing functions

describe("mverify Contract", function () {
  let mverify, contract, owner, addr1;

  beforeEach(async function () {
    // Deploy the contract before each test
    mverify = await ethers.getContractFactory("mverify");
    [owner, addr1] = await ethers.getSigners();
    contract = await mverify.deploy();
  });

  it("Should set the correct contract owner", async function () {
    expect(await contract.owner()).to.equal(owner.address);
  });

  it("Should allow only the owner to add data", async function () {
    const productId = 1;
    const merkleRoot = keccak256(toUtf8Bytes("test")); // ✅ Fixed keccak256 usage
    const cid = "QmExampleCID";

    // Ensure a non-owner cannot add data
    await expect(contract.connect(addr1).addData(productId, merkleRoot, cid))
      .to.be.revertedWith("Not authorized Entity");

    // Ensure owner can add data successfully
    await expect(contract.addData(productId, merkleRoot, cid))
      .to.emit(contract, "ProductAdded")
      .withArgs(productId, merkleRoot, cid);

    // Validate stored data
    const data = await contract.getData(productId);
    expect(data[0]).to.equal(productId);
    expect(data[1]).to.equal(merkleRoot);
    expect(data[2]).to.equal(cid);
  });

  it("Should not allow adding a duplicate product ID", async function () {
    const productId = 1;
    const merkleRoot = keccak256(toUtf8Bytes("test"));
    const cid = "QmExampleCID";

    await contract.addData(productId, merkleRoot, cid);

    // Ensure adding the same product ID fails
    await expect(contract.addData(productId, merkleRoot, cid))
      .to.be.revertedWith("Product ID already exists");
  });

  it("Should retrieve correct product data", async function () {
    const productId = 2;
    const merkleRoot = keccak256(toUtf8Bytes("data"));
    const cid = "QmAnotherExampleCID";

    await contract.addData(productId, merkleRoot, cid);

    // Fetch data and verify it
    const data = await contract.getData(productId);
    expect(data[0]).to.equal(productId);
    expect(data[1]).to.equal(merkleRoot);
    expect(data[2]).to.equal(cid);
  });

  it("Should revert when trying to retrieve non-existing product", async function () {
    await expect(contract.getData(99)).to.be.revertedWith("Product does not exist");
  });
});
