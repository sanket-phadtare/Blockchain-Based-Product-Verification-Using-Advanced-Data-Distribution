// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract mverify {

    struct Data 
    {
        uint256 product_id; 
        bytes32 merkleRoot;
        string cid;
    }

    mapping (uint256 => Data) public data;
    address public owner;


    event ProductAdded(uint256 indexed p_id, bytes32 p_merkleRoot, string p_cid);

    constructor()
    {
        owner = msg.sender;
    }

    modifier onlyOwner()
    {
        require(msg.sender == owner, "Not authorized Entity");
        _;
    }

    function addData(uint256 p_id, bytes32 p_merkleRoot, string memory p_cid) public onlyOwner {
        require(data[p_id].product_id == 0, "Product ID already exists");
        data[p_id] = Data(p_id, p_merkleRoot, p_cid);
        emit ProductAdded(p_id, p_merkleRoot, p_cid);
    }


    function getData(uint256 pr_id) public view returns (uint256, bytes32, string memory)
    {
        Data memory dataa = data[pr_id];
        require(dataa.product_id != 0, "Product does not exist");
        return (dataa.product_id, dataa.merkleRoot, dataa.cid);
    }

}