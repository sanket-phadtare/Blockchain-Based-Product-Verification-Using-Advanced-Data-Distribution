pragma solidity ^0.8.0;

contract pverify {

    struct Data 
    {
        uint256 product_id; 
        string merkleRoot;
        string cid;
    }

    mapping (uint256 => Data) public data;

    event ProductAdded(uint256 indexed p_id, string p_merkleRoot, string p_cid);

    function addData(uint256 p_id, string memory p_merkleRoot, string memory p_cid) public {
        require(data[p_id].product_id == 0, "Product ID already exists");
        data[p_id] = Data(p_id, p_merkleRoot, p_cid);
        emit ProductAdded(p_id, p_merkleRoot, p_cid);
    }


    function getData(uint256 pr_id) public view returns (uint256, string memory, string memory)
    {
        Data memory dataa = data[pr_id];
        require(dataa.product_id != 0, "Product does not exist");
        return (dataa.product_id, dataa.merkleRoot, dataa.cid);
    }

}
