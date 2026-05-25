// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721AI} from "../ERC721AI.sol";

interface IZkVerifier {
    function verifyProof(
        uint256[] calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);
}

contract ERC721AIZkVerifierStub {
    ERC721AI public erc721ai;
    address public admin;

    struct VerificationRecord {
        uint256 tokenId;
        bytes32 artifactHash;
        bytes32 proofHash;
        uint64 verifiedAt;
        bool passed;
    }

    mapping(uint256 => bytes32) public tokenProofHashes;
    mapping(bytes32 => VerificationRecord) public records;

    event ProofSubmitted(uint256 indexed tokenId, bytes32 indexed proofHash, bool passed);
    event VerifierUpdated(uint256 indexed tokenId, address verifier);

    error NotAdmin();
    error TokenNotFound();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _erc721ai, address _admin) {
        erc721ai = ERC721AI(_erc721ai);
        admin = _admin;
    }

    function submitProof(
        uint256 tokenId,
        bytes32 artifactHash,
        uint256[] calldata proof,
        uint256[] calldata publicInputs,
        address verifierContract
    ) external {
        (bytes32 modelId, bytes32 onChainArtifactHash,,,,,,,,,) = erc721ai.modelAsset(tokenId);
        if (onChainArtifactHash == bytes32(0)) revert TokenNotFound();

        bool verified = IZkVerifier(verifierContract).verifyProof(proof, publicInputs);

        bytes32 proofHash = keccak256(abi.encode(proof, publicInputs));
        tokenProofHashes[tokenId] = proofHash;

        records[proofHash] = VerificationRecord({
            tokenId: tokenId,
            artifactHash: onChainArtifactHash,
            proofHash: proofHash,
            verifiedAt: uint64(block.timestamp),
            passed: verified
        });

        emit ProofSubmitted(tokenId, proofHash, verified);
    }

    function getVerificationRecord(bytes32 proofHash) external view returns (VerificationRecord memory) {
        return records[proofHash];
    }

    function getTokenProofHash(uint256 tokenId) external view returns (bytes32) {
        return tokenProofHashes[tokenId];
    }
}
