// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ERC721AIx402PaymentManifest {
    address public admin;

    mapping(uint256 => bytes) public paymentManifests;

    event PaymentManifestSet(uint256 indexed tokenId, bytes manifest);
    event PaymentManifestCleared(uint256 indexed tokenId);

    error NotAdmin();
    error NotTokenOwner();
    error EmptyManifest();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function setPaymentManifest(uint256 tokenId, bytes calldata manifest) external {
        if (manifest.length == 0) revert EmptyManifest();
        paymentManifests[tokenId] = manifest;
        emit PaymentManifestSet(tokenId, manifest);
    }

    function clearPaymentManifest(uint256 tokenId) external onlyAdmin {
        delete paymentManifests[tokenId];
        emit PaymentManifestCleared(tokenId);
    }

    function getPaymentManifest(uint256 tokenId) external view returns (bytes memory) {
        return paymentManifests[tokenId];
    }
}
